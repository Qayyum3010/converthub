// pdfConvertHandler.js
// Handles PDF as a *source* format for the general /convert pipeline
// (Task 5.6). Kept separate from pdfHandler.js, which owns the dedicated
// PDF Tools endpoints (merge/split/compress/compare/analyze).
//
// txt/docx/html/md all go through plain-text extraction (getTextAndMetadata,
// OCR-aware) piped through Pandoc where needed, REGARDLESS of whether the
// PDF is text-based or scanned.
//
// html USED to go through LibreOffice's writer_pdf_import filter directly
// for text-based PDFs, on the theory that it would preserve visual layout
// via positioned text. In practice, PDFs with subsetted embedded fonts
// (the overwhelming common case — LaTeX, InDesign, Word-with-embedded-fonts
// all subset by default) get rasterized by LibreOffice into positioned
// <img> GIFs with zero real text content: no selectable text, nothing
// searchable, nothing accessible, and no marker/content survives at all.
// Confirmed via a full-registry test sweep, 2026-09-06 (see DECISIONS.md).
// Since real, extractable text is strictly more useful than a picture of
// text disguised as HTML, html now shares the exact same extraction path
// as txt/docx/md rather than a separate LibreOffice-direct branch.
//
// LibreOffice's writer_pdf_import reconstructs PDF layout using floating
// text frames/shapes (like Draw) for docx/md, which produces
// technically-correct-but-structurally-unusable output — no flowing
// paragraphs, just a pile of positioned text boxes. Plain text has no
// layout to preserve, so it converts cleanly into real paragraphs.
// This means text-based and scanned PDFs now use the *same* code path for
// ALL FOUR targets (txt/docx/html/md).
// See DECISIONS.md, 2026-09-03 (follow-up) and 2026-09-06 (html fix).

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { getTextAndMetadata, getFormattedMarkdown } = require("./pdfHandler");
const { convertWithPandoc } = require("./pandocHandler");

/**
 * Converts a PDF to txt/docx/html/md. All four targets go through plain
 * text extraction (OCR-aware) + Pandoc.
 *
 * @param {string} inputPath - absolute path to the source PDF
 * @param {string} outputPath - absolute path for the converted output
 * @param {string} targetFormat - "txt" | "docx" | "html" | "md"
 * @returns {Promise<void>}
 */
async function convertPdfSource(inputPath, outputPath, targetFormat) {
  const format = targetFormat.replace(/^\./, "").toLowerCase();
  const SUPPORTED = new Set(["txt", "docx", "html", "md"]);
  if (!SUPPORTED.has(format)) {
    throw new Error(`PDF conversion to "${format}" is not supported.`);
  }

  const { text, ocrUsed } = await getTextAndMetadata(inputPath);

  if (format === "txt") {
    await fs.writeFile(outputPath, text);
    return { ocrUsed };
  }

  // docx / html / md (any PDF, text-based or scanned): route extracted
  // text through Pandoc. Text-based PDFs use getFormattedMarkdown
  // (bold/italic/list markup from font inspection); scanned/OCR'd PDFs
  // fall back to the plain OCR text since there's no font/layout data in
  // OCR output to format from.
  const tmpText = path.join(
    os.tmpdir(),
    `pdfconvert-text-${Date.now()}-${Math.random().toString(36).slice(2)}.md`,
  );
  try {
    const contentToWrite = ocrUsed
      ? text
      : await getFormattedMarkdown(inputPath);
    await fs.writeFile(tmpText, contentToWrite);
    const pandocTarget = format === "md" ? "markdown" : format;
    await convertWithPandoc(tmpText, outputPath, "markdown", pandocTarget);
    return { ocrUsed };
  } catch (err) {
    throw new Error(`PDF text-extraction conversion failed: ${err.message}`);
  } finally {
    await fs.unlink(tmpText).catch(() => {});
  }
}

module.exports = { convertPdfSource };