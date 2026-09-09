// heicHandler.js
// Wraps the `heif-convert`/`heif-enc` CLI binaries (libheif-examples,
// apt package) for HEIC support. Deliberately NOT routed through sharp —
// sharp's prebuilt binary has no HEIC support, and compiling libvips from
// source with libheif-dev/libde265-dev was evaluated and rejected as too
// heavy for just 2 pairs (see DECISIONS.md, Task 5.9.4 scope note).
//
// CLI syntax confirmed directly against the running container before
// writing this handler, not assumed from memory:
//   heif-convert <input.heic> <output.jpg|png>   (format inferred from
//     output filename suffix — confirmed via `heif-convert -h`)
//   heif-enc <input.jpg|png> -o <output.heic>    (defaults to HEIC unless
//     -A flag or .avif suffix given — confirmed via `heif-enc -h`)

const { execFile } = require("child_process");
const fs = require("fs");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Converts a HEIC file to JPG or PNG via heif-convert.
 *
 * @param {string} inputPath - absolute path to the source .heic file
 * @param {string} outputPath - absolute path where the output should be written (extension determines target format)
 * @returns {Promise<void>}
 */
async function convertHeicToRaster(inputPath, outputPath) {
  try {
    await execFileAsync("heif-convert", [inputPath, outputPath]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`HEIC conversion failed: ${detail}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `HEIC conversion reported success but output was not found: ${outputPath}`,
    );
  }
}

/**
 * Converts a JPG or PNG file to HEIC via heif-enc.
 *
 * @param {string} inputPath - absolute path to the source .jpg/.png file
 * @param {string} outputPath - absolute path where the .heic should be written
 * @returns {Promise<void>}
 */
async function convertRasterToHeic(inputPath, outputPath) {
  try {
    await execFileAsync("heif-enc", [inputPath, "-o", outputPath]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`HEIC encoding failed: ${detail}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `HEIC encoding reported success but output was not found: ${outputPath}`,
    );
  }
}

module.exports = { convertHeicToRaster, convertRasterToHeic };