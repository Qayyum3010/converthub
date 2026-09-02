// nbconvertHandler.js
// Wraps `jupyter nbconvert` for Jupyter notebook conversions.
//
// ipynb->docx is NOT a native nbconvert export format (confirmed via
// `jupyter nbconvert --to docx`: "Unknown exporter docx" — its real export
// list is asciidoc/custom/html/latex/markdown/notebook/pdf/python/qtpdf/
// qtpng/rst/script/slides/webpdf). Chained instead: nbconvert to markdown,
// then Pandoc markdown->docx (both independently proven elsewhere in this
// codebase) — see DECISIONS.md.

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const execFileAsync = promisify(execFile);
const { convertWithPandoc } = require("./pandocHandler");

const NATIVE_FORMATS = new Set(["html", "markdown"]);

/**
 * Converts a Jupyter notebook to html, markdown, or docx.
 *
 * @param {string} inputPath - absolute path to the source .ipynb file
 * @param {string} outputPath - absolute path where the converted file should be written
 * @param {string} targetFormat - "html", "md", or "docx"
 * @returns {Promise<void>}
 */
async function convertNotebook(inputPath, outputPath, targetFormat) {
  const scratchDir = path.join(
    os.tmpdir(),
    "converthub-nbconvert",
    crypto.randomUUID(),
  );
  fs.mkdirSync(scratchDir, { recursive: true });

  try {
    if (targetFormat === "docx") {
      // Chain: nbconvert -> markdown (scratch), then Pandoc markdown -> docx
      const scratchMd = path.join(scratchDir, "intermediate.md");
      await runNbconvert(inputPath, scratchMd, "markdown");
      await convertWithPandoc(scratchMd, outputPath, "markdown", "docx");
    } else {
      const nbFormat = targetFormat === "md" ? "markdown" : targetFormat;
      if (!NATIVE_FORMATS.has(nbFormat)) {
        throw new Error(`Unsupported nbconvert target format: ${targetFormat}`);
      }
      await runNbconvert(inputPath, outputPath, nbFormat);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Notebook conversion reported success but output was not found: ${outputPath}`,
      );
    }
  } finally {
    fs.rm(scratchDir, { recursive: true, force: true }, () => {});
  }
}

/**
 * Runs `jupyter nbconvert --to <format>` and confirms the output landed at
 * the exact path we expect. nbconvert supports --output for the basename,
 * but always writes into the input file's own directory unless
 * --output-dir is also given — so we pass both to fully control placement.
 */
async function runNbconvert(inputPath, outputPath, nbFormat) {
  const outputDir = path.dirname(outputPath);
  const outputBasename = path.basename(outputPath, path.extname(outputPath));

  try {
    await execFileAsync("jupyter", [
      "nbconvert",
      "--to",
      nbFormat,
      inputPath,
      "--output",
      outputBasename,
      "--output-dir",
      outputDir,
    ]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`nbconvert failed: ${detail}`);
  }
}

module.exports = { convertNotebook };
