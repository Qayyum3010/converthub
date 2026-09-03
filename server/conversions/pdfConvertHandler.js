// pdfConvertHandler.js
// Handles PDF as a *source* format for the general /convert pipeline
// (Task 5.6). Kept separate from pdfHandler.js, which owns the dedicated
// PDF Tools endpoints (merge/split/compress/compare/analyze).
//
// html: goes through LibreOffice with the writer_pdf_import filter to
// preserve visual layout (fine for a browser view).
// txt/docx/md: goes through plain-text extraction (getTextAndMetadata,
// OCR-aware) piped through Pandoc where needed, REGARDLESS of whether the
// PDF is text-based or scanned. LibreOffice's writer_pdf_import reconstructs
// PDF layout using floating text frames/shapes (like Draw), which produces
// technically-correct-but-structurally-unusable docx/md output — no
// flowing paragraphs, just a pile of positioned text boxes. Plain text has
// no layout to preserve, so it converts cleanly into real paragraphs.
// This means text-based and scanned PDFs now use the *same* code path for
// txt/docx/md; only html still branches on ocrUsed vs not.
// See DECISIONS.md, 2026-09-03 (follow-up).

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { getTextAndMetadata, getFormattedMarkdown } = require("./pdfHandler");
const { convertWithLibreOffice } = require("./libreofficeHandler");
const { convertWithPandoc } = require("./pandocHandler");

/**
 * Converts a PDF to txt/docx/html/md. txt/docx/md always go through plain
 * text extraction (OCR-aware) + Pandoc. html goes through LibreOffice
 * directly (text-based) or via the OCR'd-text-through-Pandoc path (scanned).
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

  if (format === "html" && !ocrUsed) {
    // Text-based PDF, html target only: LibreOffice direct, visual layout
    // preserved via writer_pdf_import. Fine here since html has no concept
    // of "editable flowing paragraphs" the way docx does.
    await convertWithLibreOffice(
      inputPath,
      outputPath,
      format,
      "writer_pdf_import",
    );
    return { ocrUsed };
  }

  // docx / md (any PDF), and html for scanned PDFs: route extracted text
  // through Pandoc. Text-based PDFs use getFormattedMarkdown (bold/italic/
  // list markup from font inspection); scanned/OCR'd PDFs fall back to the
  // plain OCR text since there's no font/layout data in OCR output to
  // format from.
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
