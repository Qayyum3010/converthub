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
const pdfParse = require("pdf-parse");

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
 * @param {string} inputPath - absolute path to the PDF
 * @returns {Promise<object>} - { text, author, title, createdDate }
 */
async function getTextAndMetadata(inputPath) {
  const buffer = await fs.readFile(inputPath);
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    author: data.info?.Author || null,
    title: data.info?.Title || null,
    createdDate: data.info?.CreationDate || null,
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
 * Compares two PDFs' extracted text and returns a simple line-level diff.
 * @param {string} pathA - absolute path to first PDF
 * @param {string} pathB - absolute path to second PDF
 * @returns {Promise<object>} - { linesOnlyInA, linesOnlyInB, identical }
 */
async function comparePdfs(pathA, pathB) {
  const [a, b] = await Promise.all([
    getTextAndMetadata(pathA),
    getTextAndMetadata(pathB),
  ]);

  const linesA = a.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const linesB = b.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const setB = new Set(linesB);
  const setA = new Set(linesA);

  const linesOnlyInA = linesA.filter((l) => !setB.has(l));
  const linesOnlyInB = linesB.filter((l) => !setA.has(l));

  return {
    identical: linesOnlyInA.length === 0 && linesOnlyInB.length === 0,
    linesOnlyInA,
    linesOnlyInB,
  };
}

module.exports = {
  mergePdfs,
  splitPdf,
  compressPdf,
  getStructuralInfo,
  getTextAndMetadata,
  analyzePdf,
  comparePdfs,
};
