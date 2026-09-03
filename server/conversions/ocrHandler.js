// ocrHandler.js
// OCR fallback for scanned/image-only PDFs where pdf-parse's embedded-text
// extraction returns empty. Two-stage pipeline since Tesseract can't read
// PDFs directly: pdftoppm (poppler-utils) rasterizes each page to a PNG,
// then Tesseract OCRs each page image independently. Page texts are
// concatenated in page order.
//
// Uses an isolated scratch dir per call (same pattern as latexHandler.js /
// libreofficeHandler.js) since pdftoppm writes numbered output files
// (input-1.png, input-2.png, ...) into its working directory rather than
// a single named output.

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const execFileAsync = promisify(execFile);

const OCR_DPI = 200; // balance of text legibility vs. per-page processing time/memory
const MAX_OCR_PAGES = 50; // hard cap — OCR is slow per-page, prevents a huge scanned PDF from hanging a request indefinitely

/**
 * Rasterizes each page of a PDF into PNG images in the given scratch dir.
 * @param {string} inputPath - absolute path to the source PDF
 * @param {string} scratchDir - absolute path to an existing empty scratch dir
 * @returns {Promise<string[]>} - absolute paths to the generated page images, in page order
 */
async function rasterizePages(inputPath, scratchDir) {
  const outPrefix = path.join(scratchDir, "page");
  try {
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      String(OCR_DPI),
      inputPath,
      outPrefix,
    ]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`PDF rasterization failed: ${detail}`);
  }

  const files = await fs.readdir(scratchDir);
  const pageFiles = files
    .filter((f) => f.startsWith("page") && f.endsWith(".png"))
    // pdftoppm names files page-1.png, page-2.png, ... page-10.png — sort
    // numerically, not lexicographically, or page-10 sorts before page-2.
    .sort((a, b) => {
      const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] ?? "0", 10);
      const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] ?? "0", 10);
      return numA - numB;
    });

  if (pageFiles.length === 0) {
    throw new Error("PDF rasterization produced no page images.");
  }
  if (pageFiles.length > MAX_OCR_PAGES) {
    throw new Error(
      `PDF has ${pageFiles.length} pages, exceeding the ${MAX_OCR_PAGES}-page OCR limit.`,
    );
  }

  return pageFiles.map((f) => path.join(scratchDir, f));
}

/**
 * Runs Tesseract on a single page image and returns its extracted text.
 * @param {string} imagePath - absolute path to a page PNG
 * @returns {Promise<string>}
 */
async function ocrPageImage(imagePath) {
  // Tesseract's CLI writes to <outputbase>.txt, not stdout, when given a
  // file output base rather than "stdout" as the second arg.
  const outputBase = imagePath.replace(/\.png$/, "");
  try {
    await execFileAsync("tesseract", [imagePath, outputBase]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`OCR failed on page image: ${detail}`);
  }
  const text = await fs.readFile(`${outputBase}.txt`, "utf8");
  return text;
}

/**
 * Full OCR pipeline: rasterize a PDF's pages, OCR each, concatenate text.
 * @param {string} inputPath - absolute path to the source PDF
 * @returns {Promise<string>} - concatenated OCR'd text, pages separated by \n\n
 */
async function extractTextViaOCR(inputPath) {
  const scratchDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "converthub-ocr-"),
  );
  try {
    const pageImages = await rasterizePages(inputPath, scratchDir);
    const pageTexts = [];
    // Sequential, not Promise.all — Tesseract is CPU-heavy; running many
    // pages in parallel risks resource exhaustion on a shared container
    // more than it saves in wall-clock time. Revisit if this proves too
    // slow in practice against real multi-page scanned fixtures.
    for (const imagePath of pageImages) {
      const text = await ocrPageImage(imagePath);
      pageTexts.push(text.trim());
    }
    return pageTexts.join("\n\n");
  } finally {
    await fs.rm(scratchDir, { recursive: true, force: true });
  }
}

module.exports = { extractTextViaOCR };
