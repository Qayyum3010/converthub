// libreofficeHandler.js
// Wraps `soffice --headless --convert-to` for office document conversions
// (DOCX/XLSX/PPTX <-> PDF, XLSX->CSV, PPTX->ODP, etc).
//
// LibreOffice's headless CLI doesn't let you name the output file directly —
// it writes <basename>.<ext> into --outdir using the *input's* basename.
// So we run it into a scratch dir, then move/rename the result to the exact
// outputPath the rest of the app expects (same contract as convertWithPandoc).

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const execFileAsync = promisify(execFile);

/**
 * Converts a file using LibreOffice headless.
 *
 * @param {string} inputPath - absolute path to the source file
 * @param {string} outputPath - absolute path where the converted file should end up
 * @param {string} targetFormat - LibreOffice --convert-to filter/extension (e.g. "pdf", "csv", "odp")
 * @returns {Promise<void>}
 */
async function convertWithLibreOffice(inputPath, outputPath, targetFormat) {
  // Isolated scratch dir per job — avoids collisions if multiple jobs with
  // the same input basename run concurrently, and keeps --outdir predictable.
  const scratchDir = path.join(
    os.tmpdir(),
    "converthub-libreoffice",
    crypto.randomUUID(),
  );
  fs.mkdirSync(scratchDir, { recursive: true });

  try {
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      targetFormat,
      "--outdir",
      scratchDir,
      inputPath,
    ]);

    const inputBasename = path.basename(inputPath, path.extname(inputPath));
    const producedPath = path.join(
      scratchDir,
      `${inputBasename}.${targetFormat}`,
    );

    if (!fs.existsSync(producedPath)) {
      throw new Error(
        `LibreOffice reported success but expected output was not found: ${producedPath}`,
      );
    }

    fs.renameSync(producedPath, outputPath);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`LibreOffice conversion failed: ${detail}`);
  } finally {
    fs.rm(scratchDir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { convertWithLibreOffice };
