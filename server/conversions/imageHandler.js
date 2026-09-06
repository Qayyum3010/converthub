// imageHandler.js
// Wraps `sharp` (libvips) for raster image conversions: JPG/PNG/WebP/GIF/
// TIFF/AVIF cross-matrix, plus SVG-as-source rasterization (Subtask 5.9.3)
// and HEIC support via CLI shell-out (Subtask 5.9.4, separate module).
//
// gif -> * conversions read only the FIRST FRAME by default — sharp does
// not read/write animated GIFs unless explicitly told to via
// { animated: true }, and we deliberately don't do that here (this task's
// scope note: "all gif-> pairs: first-frame only — animation is lost,
// this is a known, accepted lossy behavior"). Confirmed via Sharp's own
// docs, not assumed from memory.

const sharp = require("sharp");

// Maps our file extensions to Sharp's internal format identifiers.
// jpg/jpeg both map to "jpeg" — Sharp has no separate "jpg" format name.
const EXT_TO_SHARP_FORMAT = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
  tiff: "tiff",
  avif: "avif",
};

/**
 * Converts a raster image between JPG/PNG/WebP/GIF/TIFF/AVIF formats.
 *
 * @param {string} inputPath - absolute path to the source image
 * @param {string} outputPath - absolute path where the converted image should be written
 * @param {string} targetExt - target extension, no dot (e.g. "png")
 * @returns {Promise<void>}
 */
async function convertImage(inputPath, outputPath, targetExt) {
  const ext = targetExt.replace(/^\./, "").toLowerCase();
  const sharpFormat = EXT_TO_SHARP_FORMAT[ext];

  if (!sharpFormat) {
    throw new Error(`Unsupported image target format: ${targetExt}`);
  }

  try {
    await sharp(inputPath).toFormat(sharpFormat).toFile(outputPath);
  } catch (err) {
    throw new Error(`Image conversion failed: ${err.message}`);
  }
}

module.exports = { convertImage, EXT_TO_SHARP_FORMAT };