// pdfHandler.js
// Wraps qpdf (CLI) for structural PDF operations — merge, split, compress,
// encryption/version checks, linearization ("Fast Web View") — and pdf-parse
// (npm, v1.x specifically — see note below) for text extraction and
// Author/Title/CreationDate metadata, which qpdf's --json output does not
// surface as cleanly.
//
// IMPORTANT: pdf-parse is pinned to v1.1.1, not the current v2.x line.
// v2 bundles pdf.js internals that require Node 20+ (uses
// process.getBuiltinModule and browser-only APIs like DOMMatrix/ImageData/
// Path2D). This container runs Node 18. v1.1.1 has no such dependency and
// works cleanly. Do not upgrade without also bumping the Dockerfile's Node
// version and re-verifying.

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const execFileAsync = promisify(execFile);

/**
 * pdf.js's getOperatorList()/commonObjs never populates font descriptor
 * flags (bold/italic) for this build — confirmed via diagnostic logging,
 * see DECISIONS.md 2026-09-03 (follow-up 7): the promise resolves cleanly,
 * it just doesn't fill in the data, so there's no error to catch or fix.
 *
 * Workaround: shell out to poppler's `pdffonts`, which reads real font
 * names (e.g. "LMRoman10-Bold") straight from the PDF's font descriptors.
 * We then correlate pdf.js's local per-page resource keys (fontName like
 * "g_d1_f9") to pdffonts' real names ordinally — by the order each local
 * key is FIRST seen during text extraction, matched against pdffonts'
 * listing order (ascending object ID). This works because both orderings
 * normally follow first-definition/first-use order in the content stream.
 *
 * KNOWN LIMITATION: this is a heuristic, not a guaranteed mapping. PDFs
 * with unusual font-definition ordering (fonts defined out of use-order,
 * heavy font subsetting/reuse across pages) can misalign it. Documented
 * 2026-09-03 (follow-up 8) as an accepted trade-off — see DECISIONS.md.
 */
async function getFontStyleResolver(pdfPath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("pdffonts", [pdfPath]));
  } catch (err) {
    console.log("[pdffonts error]", (err && err.stack) || err);
    return { resolve: () => ({ isBold: false, isItalic: false }) };
  }

  const lines = stdout
    .split("\n")
    .slice(2) // skip header + separator row
    .filter((l) => l.trim().length > 0);

  const orderedFonts = lines.map((line) => {
    const name = line.trim().split(/\s+/)[0] || "";
    return {
      name,
      isBold: /-?bold/i.test(name),
      isItalic: /-?italic|-?oblique/i.test(name),
    };
  });

  const localKeyToIndex = new Map();
  let nextIndex = 0;

  return {
    resolve(localFontName) {
      if (!localKeyToIndex.has(localFontName)) {
        if (nextIndex < orderedFonts.length) {
          localKeyToIndex.set(localFontName, nextIndex);
          nextIndex += 1;
        } else {
          // more local keys than pdffonts entries — can happen; fall back
          localKeyToIndex.set(localFontName, orderedFonts.length - 1);
        }
      }
      const idx = localKeyToIndex.get(localFontName);
      return orderedFonts[idx] || { isBold: false, isItalic: false };
    },
  };
}

// pdf-parse bundles an old pdf.js (v1.10.100) that assumes a browser DOM.
// Earlier follow-ups relied on getOperatorList() to force font-descriptor
// resolution, which triggered pdf.js's FontLoader trying to register real
// @font-face rules via document.createElement('style') — a browser-only
// API that doesn't exist in Node and crashed the process from inside an
// internal pdf.js callback our try/catch never saw. That path has since
// been abandoned in favor of pdffonts-based style detection (follow-up 8),
// but this shim is left in place defensively in case any other part of
// pdf-parse/pdf.js still probes for `document` during normal parsing.
// See DECISIONS.md, 2026-09-03 (follow-up 3, follow-up 5).
if (typeof global.document === "undefined") {
  const noop = () => {};
  const fakeHead = { appendChild: noop, remove: noop };
  global.document = {
    createElement: () => ({
      sheet: { insertRule: noop, cssRules: [] },
      style: {},
      setAttribute: noop,
      appendChild: noop,
      remove: noop,
    }),
    documentElement: {
      appendChild: noop,
      getElementsByTagName: () => [fakeHead],
    },
    fonts: undefined,
  };
}

const pdfParse = require("pdf-parse");
const { extractTextViaOCR } = require("./ocrHandler");

// pdf-parse's default text join only inserts a newline on a vertical
// position jump — it never inserts a space for a horizontal gap between
// adjacent text runs on the same line. Since many PDFs split a line into
// several runs (different font, style, or just how the PDF was generated),
// this silently mashes words together ("a text-based PDF" -> "atext-basedPDF").
// This custom pagerender walks pdf.js's raw text items ourselves and adds
// a space whenever the horizontal gap between runs is wide enough to be a
// real word boundary. See DECISIONS.md, 2026-09-03.
//
// `withFormatting: true` additionally inspects each item's fontName for
// bold/italic/oblique and wraps runs in markdown emphasis markers, and
// normalizes bullet characters into markdown list syntax. This is ONLY
// used for the /convert pipeline (pdfConvertHandler.js) — plain
// getTextAndMetadata() output (used by Analyze/Compare/txt) stays
// unformatted, since markdown syntax in those would corrupt keyword
// extraction and diffing.
function makeTextRenderer({
  withFormatting = false,
  fontResolver = null,
} = {}) {
  return function renderPage(pageData) {
    // getOperatorList() previously called here to force pdf.js to resolve
    // font descriptors into commonObjs — abandoned 2026-09-03 (follow-up 8)
    // once diagnostic logging confirmed it never populates that data for
    // this pdf.js build regardless. Styling now comes entirely from
    // pdffonts via detectStyle()/getFontStyleResolver. Removed to avoid
    // the extra parse pass for no benefit. See DECISIONS.md.
    return pageData
      .getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      })
      .then((textContent) => {
        const lines = []; // { text, maxHeight }
        let current = { text: "", maxHeight: 0 };
        let lastY = null;
        let lastXEnd = null;

        const pushLine = () => {
          lines.push(current);
          current = { text: "", maxHeight: 0 };
        };

        for (const item of textContent.items) {
          const x = item.transform[4];
          const y = item.transform[5];
          const height = item.height || Math.abs(item.transform[3]) || 10;
          const runTextRaw = item.str;

          if (lastY !== null && Math.abs(y - lastY) > height * 0.5) {
            const hyphenMatch = /[A-Za-z]-$/.test(current.text);
            const nextStartsLower = /^[a-z]/.test(runTextRaw);
            if (hyphenMatch && nextStartsLower) {
              current.text = current.text.slice(0, -1);
            } else {
              pushLine();
            }
            lastXEnd = null;
          } else if (lastXEnd !== null) {
            const gap = x - lastXEnd;
            if (gap > height * 0.25) current.text += " ";
          }

          let runText = runTextRaw;
          if (withFormatting && runText.trim()) {
            const { isBold, isItalic } = detectStyle(item, fontResolver);
            if (isBold && isItalic) runText = `***${runText}***`;
            else if (isBold) runText = `**${runText}**`;
            else if (isItalic) runText = `*${runText}*`;
          }

          current.text += runText;
          current.maxHeight = Math.max(current.maxHeight, height);
          lastY = y;
          lastXEnd = x + (item.width || 0);
        }
        pushLine();

        if (withFormatting) markHeadings(lines);

        // Pandoc's markdown reader requires a blank line before (and
        // after) an ATX "## heading" line to recognize it as a heading
        // block — without it, the "##" is read as literal characters
        // glued onto the surrounding paragraph. markHeadings() only adds
        // the "## " prefix; this pass adds the blank lines Pandoc needs
        // around any line that got marked as a heading. See DECISIONS.md,
        // 2026-09-03 (follow-up 9).
        const spacedLines = [];
        lines.forEach((line, i) => {
          const isHeading = /^##\s/.test(line.text);
          if (
            isHeading &&
            spacedLines.length &&
            spacedLines[spacedLines.length - 1].trim() !== ""
          ) {
            spacedLines.push("");
          }
          spacedLines.push(line.text);
          const nextLine = lines[i + 1];
          if (isHeading && nextLine && nextLine.text.trim() !== "") {
            spacedLines.push("");
          }
        });

        const pageText = spacedLines.join("\n");
        return stripTrailingPageNumber(pageText);
      });
  };
}

// A PDF has no semantic "this is a heading" flag — just bigger text. This
// flags lines whose font size is meaningfully larger than the page's
// typical body-text size as a markdown heading ("## "), so Pandoc renders
// them as real Word headings instead of plain paragraphs.
//
// Threshold lowered from 1.3x to 1.15x based on real measured data from
// our test PDF: body text sits at 9.96, "Section Two" (which should be
// a heading) sits at 11.96 -- a 1.20x ratio that 1.3x was missing
// entirely. 1.15x catches it while still sitting above the next-
// closest body-text outlier in the same doc (10.16, a 1.02x ratio,
// safely excluded). See DECISIONS.md, 2026-09-03 (follow-up 7).
function markHeadings(lines) {
  const heights = lines
    .filter((l) => l.text.trim())
    .map((l) => l.maxHeight)
    .sort((a, b) => a - b);
  if (heights.length < 2) return;
  const median = heights[Math.floor(heights.length / 2)];
  if (!median) return;

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!trimmed) continue;
    if (/^[•·▪‣]/.test(trimmed)) continue;
    if (line.maxHeight >= median * 1.15) {
      line.text = `## ${trimmed}`;
    }
  }
}

// Bold/italic detection via poppler's pdffonts CLI, correlated ordinally
// to pdf.js's local per-page resource keys. Verified 2026-09-03 against
// the text-based.pdf test fixture: every run (heading bold, inline bold,
// inline italic, regular body, bullet glyphs) matched the known-correct
// answer. pdf.js's own commonObjs/getOperatorList path never populates
// font descriptor flags for this build (confirmed via diagnostic logging,
// follow-up 7) — it isn't used as a signal here anymore, only as a last-
// resort fallback if pdffonts itself fails to run (see
// getFontStyleResolver's catch, which returns a resolver defaulting to
// {isBold: false, isItalic: false}). See DECISIONS.md, 2026-09-03
// (follow-up 8).
//
// KNOWN LIMITATION: the ordinal correlation assumes pdf.js's first-use
// order matches pdffonts' object-ID order. Holds for normally-generated
// PDFs; can misalign on PDFs with unusual font-definition ordering.
function detectStyle(item, fontResolver) {
  if (!fontResolver || !item.fontName) {
    return { isBold: false, isItalic: false };
  }
  const { isBold, isItalic } = fontResolver.resolve(item.fontName);
  return { isBold, isItalic };
}

// Strips a trailing standalone page-number line (footer artifact) from a
// page's extracted text — e.g. a lone "1" or "23" on its own final line.
// Deliberately narrow (last line only, 1-4 digits) to avoid eating
// legitimate numeric content elsewhere in the body. See DECISIONS.md,
// 2026-09-03 (follow-up).
function stripTrailingPageNumber(pageText) {
  const lines = pageText.split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length && /^\d{1,4}$/.test(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  return lines.join("\n");
}

// Normalizes common bullet glyphs into markdown list syntax, and ensures a
// blank line precedes the first item of a run (Pandoc requires a blank
// line before a list to recognize it as one, not a paragraph).
function normalizeMarkdownLists(text) {
  const lines = text.split("\n");
  const result = [];
  let prevWasListItem = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = /^[•·▪‣]\s*/.exec(trimmed);
    if (bulletMatch) {
      if (
        !prevWasListItem &&
        result.length &&
        result[result.length - 1].trim() !== ""
      ) {
        result.push("");
      }
      result.push("- " + trimmed.slice(bulletMatch[0].length));
      prevWasListItem = true;
    } else {
      result.push(line);
      prevWasListItem = false;
    }
  }
  return result.join("\n");
}

/**
 * Validates a PDF before any processing — catches corrupt files, encrypted
 * files (unsupported, no password flow in v1), and a cheap page-count cap
 * as a resource-exhaustion guard. Called at the top of every /pdf/* route
 * handler before the real operation runs.
 *
 * @param {string} inputPath - absolute path to the PDF to validate
 * @returns {Promise<void>} - resolves if valid, throws with a clear message otherwise
 */
const MAX_PDF_PAGES = 2000;

async function validatePdf(inputPath) {
  let checkOut = "";
  try {
    const result = await execFileAsync("qpdf", ["--check", inputPath]);
    checkOut = result.stdout;
  } catch (err) {
    // qpdf --check exits non-zero for both recoverable warnings and hard
    // failures — inspect stdout/stderr rather than treating any non-zero
    // exit as fatal, same pattern as getStructuralInfo()'s linearization check.
    checkOut = err.stdout || "";
    const stderr = err.stderr || "";

    // Verified against a real qpdf 11.3.0 test: an encrypted PDF we don't
    // have the password for fails --check with "invalid password" in
    // stderr, NOT a "file is encrypted" note in stdout — the earlier
    // stdout-matching approach never fired. Check stderr directly instead.
    if (/invalid password/i.test(stderr)) {
      throw new Error(
        "Password-protected PDFs are not supported. Please upload an unencrypted PDF.",
      );
    }

    if (
      /no such file|not a pdf|file is damaged|error/i.test(stderr) &&
      !checkOut
    ) {
      throw new Error(
        `File is not a valid PDF or is corrupted: ${stderr.trim() || err.message}`,
      );
    }
  }

  // Kept as a secondary net: some encryption scenarios (e.g. an empty user
  // password that --check can actually open) may surface a "file is
  // encrypted" note in stdout rather than failing outright. Untested against
  // a real fixture so far — not deleting on a hunch, just documenting that
  // the "invalid password" branch above is the one we've actually verified.
  if (/file is encrypted/i.test(checkOut)) {
    throw new Error(
      "Password-protected PDFs are not supported. Please upload an unencrypted PDF.",
    );
  }

  try {
    const { stdout: jsonOut } = await execFileAsync("qpdf", [
      "--json",
      inputPath,
    ]);
    const parsed = JSON.parse(jsonOut);
    const pageCount = parsed.pages ? parsed.pages.length : 0;
    if (pageCount > MAX_PDF_PAGES) {
      throw new Error(
        `PDF has ${pageCount} pages, exceeding the ${MAX_PDF_PAGES}-page limit.`,
      );
    }
  } catch (err) {
    if (err.message.includes("exceeding the")) {
      throw err; // our own page-limit error, re-throw as-is
    }
    throw new Error(`Could not read PDF structure: ${err.message}`);
  }
}

/**
 * Merges multiple PDFs into one, in the given order.
 *
 * @param {string[]} inputPaths - absolute paths to source PDFs, in merge order
 * @param {string} outputPath - absolute path for the merged output
 * @returns {Promise<void>}
 */
async function mergePdfs(inputPaths, outputPath) {
  if (inputPaths.length < 2) {
    throw new Error("Merge requires at least 2 PDF files.");
  }
  try {
    await execFileAsync("qpdf", [
      "--empty",
      "--pages",
      ...inputPaths,
      "--",
      outputPath,
    ]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`PDF merge failed: ${detail}`);
  }
}

/**
 * Extracts a page range from a PDF into a new file.
 *
 * @param {string} inputPath - absolute path to the source PDF
 * @param {string} outputPath - absolute path for the extracted-pages output
 * @param {string} pageRange - qpdf page range syntax, e.g. "1-3", "1,3,5", "2-z"
 * @returns {Promise<void>}
 */
async function splitPdf(inputPath, outputPath, pageRange) {
  try {
    await execFileAsync("qpdf", [
      inputPath,
      "--pages",
      ".",
      pageRange,
      "--",
      outputPath,
    ]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`PDF split failed: ${detail}`);
  }
}

/**
 * Compresses a PDF via qpdf's stream/image optimization flags.
 *
 * @param {string} inputPath - absolute path to the source PDF
 * @param {string} outputPath - absolute path for the compressed output
 * @returns {Promise<void>}
 */
async function compressPdf(inputPath, outputPath) {
  try {
    await execFileAsync("qpdf", [
      "--optimize-images",
      "--compress-streams=y",
      "--object-streams=generate",
      inputPath,
      outputPath,
    ]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`PDF compression failed: ${detail}`);
  }
}

/**
 * Gathers structural info via qpdf --json and --check.
 * @param {string} inputPath - absolute path to the PDF
 * @returns {Promise<object>} - { pageCount, pdfVersion, encrypted, linearized, embeddedFonts }
 */
async function getStructuralInfo(inputPath) {
  const { stdout: jsonOut } = await execFileAsync("qpdf", [
    "--json",
    inputPath,
  ]);
  const parsed = JSON.parse(jsonOut);

  const pageCount = parsed.pages ? parsed.pages.length : 0;
  const pdfVersion = parsed.qpdf?.[0]?.pdfversion ?? null;
  const encrypted = parsed.encrypt?.encrypted ?? false;

  // Embedded fonts: scan the object graph for /Type "/Font" entries and
  // collect their /BaseFont names.
  const embeddedFonts = new Set();
  const objects = parsed.qpdf?.[1] ?? {};
  for (const key of Object.keys(objects)) {
    const obj = objects[key]?.value;
    if (obj && obj["/Type"] === "/Font" && obj["/BaseFont"]) {
      embeddedFonts.add(obj["/BaseFont"].replace(/^\//, ""));
    }
  }

  // Linearization ("Fast Web View") isn't in --json output; qpdf --check
  // reports it in its plain-text diagnostic instead. --check exits non-zero
  // on some warnings-but-not-fatal cases, so don't let a non-zero exit
  // short-circuit before we've read stdout.
  let linearized = false;
  try {
    const { stdout: checkOut } = await execFileAsync("qpdf", [
      "--check",
      inputPath,
    ]);
    linearized = /is linearized/i.test(checkOut);
  } catch (err) {
    // qpdf --check can exit non-zero for recoverable warnings while still
    // printing useful stdout — check err.stdout before giving up.
    if (err.stdout) {
      linearized = /is linearized/i.test(err.stdout);
    }
  }

  return {
    pageCount,
    pdfVersion,
    encrypted,
    linearized,
    embeddedFonts: [...embeddedFonts],
  };
}

/**
 * Extracts raw text and Author/Title/CreationDate metadata via pdf-parse.
 * Falls back to OCR (ocrHandler.js) when pdf-parse returns empty/whitespace-
 * only text — this happens for scanned/image-only PDFs, which have no
 * embedded text layer for pdf-parse to find at all.
 * @param {string} inputPath - absolute path to the PDF
 * @returns {Promise<object>} - { text, author, title, createdDate, ocrUsed }
 */
async function getTextAndMetadata(inputPath) {
  const buffer = await fs.readFile(inputPath);
  const data = await pdfParse(buffer, { pagerender: makeTextRenderer() });

  const embeddedText = data.text || "";
  let text = embeddedText;
  let ocrUsed = false;

  if (embeddedText.trim().length === 0) {
    // No embedded text layer — likely a scanned/image-only PDF. Metadata
    // (Author/Title/CreationDate) still comes from pdf-parse above, since
    // that lives in the PDF's info dictionary regardless of whether the
    // page content is text or images; only the text extraction itself
    // needs the OCR fallback.
    text = await extractTextViaOCR(inputPath);
    ocrUsed = true;
  }

  return {
    text,
    author: data.info?.Author || null,
    title: data.info?.Title || null,
    createdDate: data.info?.CreationDate || null,
    ocrUsed,
  };
}

/**
 * Very simple word-frequency based keyword extraction — no LLM, no NLP
 * library, matches PROJECT_OVERVIEW.md's "simple NLP only" scope for
 * Analyze's Semantic Analysis field.
 * @param {string} text - extracted PDF text
 * @param {number} topN - how many top keywords to return
 * @returns {string[]}
 */
function extractKeywords(text, topN = 10) {
  const STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "is",
    "are",
    "was",
    "were",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "as",
    "by",
    "at",
    "this",
    "that",
    "it",
    "be",
    "from",
    "has",
    "have",
    "had",
    "not",
    "some",
    "here",
    "there",
    "about",
    "into",
    "than",
    "then",
    "them",
    "they",
    "their",
    "its",
    "his",
    "her",
    "our",
    "your",
    "all",
    "any",
    "can",
    "will",
    "would",
    "should",
    "could",
    "also",
    "more",
    "most",
    "such",
    "other",
    "each",
    "which",
    "what",
    "when",
    "where",
    "who",
    "how",
  ]);
  const counts = {};
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    counts[word] = (counts[word] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

/**
 * Full Analyze report combining structural info + text/metadata + keywords.
 * @param {string} inputPath - absolute path to the PDF
 * @returns {Promise<object>}
 */
async function analyzePdf(inputPath) {
  const [structural, textMeta] = await Promise.all([
    getStructuralInfo(inputPath),
    getTextAndMetadata(inputPath),
  ]);

  return {
    ...structural,
    ...textMeta,
    keywords: extractKeywords(textMeta.text),
  };
}

/**
 * Compares two PDFs' extracted text via a true sequence-aware line diff
 * (Myers algorithm, via the `diff` package) — NOT a Set-membership check.
 * This correctly distinguishes "same lines, different order/count" from
 * genuinely identical documents, unlike a naive Set-based approach.
 *
 * @param {string} pathA - absolute path to first PDF
 * @param {string} pathB - absolute path to second PDF
 * @returns {Promise<object>} - { identical, linesOnlyInA, linesOnlyInB }
 */
const { diffLines } = require("diff");

async function comparePdfs(pathA, pathB) {
  const [a, b] = await Promise.all([
    getTextAndMetadata(pathA),
    getTextAndMetadata(pathB),
  ]);

  const textA = a.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const textB = b.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

  const changes = diffLines(textA, textB);

  const linesOnlyInA = [];
  const linesOnlyInB = [];

  for (const part of changes) {
    const lines = part.value.split("\n").filter(Boolean);
    if (part.removed) {
      linesOnlyInA.push(...lines);
    } else if (part.added) {
      linesOnlyInB.push(...lines);
    }
  }

  return {
    identical: linesOnlyInA.length === 0 && linesOnlyInB.length === 0,
    linesOnlyInA,
    linesOnlyInB,
  };
}

/**
 * Like getTextAndMetadata, but returns markdown-formatted text (bold/italic
 * markers from font-name inspection, bullet lines normalized into markdown
 * list syntax) instead of plain text. Used only by the /convert pipeline
 * for PDF->docx/md, where Pandoc will render the markup into real
 * document formatting. Do NOT use this for Analyze/Compare/txt — those
 * need clean plain text, not markdown syntax mixed in. See DECISIONS.md,
 * 2026-09-03.
 *
 * @param {string} inputPath - absolute path to the source PDF
 * @returns {Promise<string>}
 */
async function getFormattedMarkdown(inputPath) {
  const buffer = await fs.readFile(inputPath);
  // Built once per document (not per page) so the ordinal local-key ->
  // real-font-name mapping in getFontStyleResolver stays consistent
  // across every page's callback. See DECISIONS.md, 2026-09-03 (follow-up 8).
  const fontResolver = await getFontStyleResolver(inputPath);
  const data = await pdfParse(buffer, {
    pagerender: makeTextRenderer({ withFormatting: true, fontResolver }),
  });
  return normalizeMarkdownLists(data.text || "");
}

module.exports = {
  getFormattedMarkdown,
  validatePdf,
  mergePdfs,
  splitPdf,
  compressPdf,
  getStructuralInfo,
  getTextAndMetadata,
  analyzePdf,
  comparePdfs,
  getFontStyleResolver,
};
