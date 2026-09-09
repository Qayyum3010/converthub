// pandocHandler.js
// Wraps the `pandoc` CLI for lightweight-markup and text-format conversions.

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Converts a file using Pandoc.
 *
 * @param {string} inputPath - absolute path to the source file
 * @param {string} outputPath - absolute path where the converted file should be written
 * @param {string} fromFormat - Pandoc format name for the source (e.g. "markdown")
 * @param {string} toFormat - Pandoc format name for the target (e.g. "html")
 * @returns {Promise<void>}
 */
async function convertWithPandoc(
  inputPath,
  outputPath,
  fromFormat,
  toFormat,
  extraArgs = [],
) {
  try {
    await execFileAsync("pandoc", [
      inputPath,
      "-f",
      fromFormat,
      "-t",
      toFormat,
      "-o",
      outputPath,
      ...extraArgs,
    ]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;

    // Pandoc treats a failed remote-image fetch as fatal for formats that
    // embed images (pptx, docx, etc.), and the raw error is a multi-line
    // Haskell exception dump (connection/DNS/HTTP details) that means
    // nothing to an end user. Recognize this specific failure mode and
    // surface something actionable instead.
    if (/Could not fetch/i.test(detail)) {
      throw new Error(
        "This file references an image that couldn't be downloaded (it may require login, be private, or no longer exist). Remove or replace that image link and try again.",
      );
    }

    // Pandoc writes useful detail to stderr on failure (e.g. malformed
    // input, unsupported format combo despite our registry saying it's
    // valid) — surface it rather than just the generic exec error.
    throw new Error(`Pandoc conversion failed: ${detail}`);
  }
}

module.exports = { convertWithPandoc };
