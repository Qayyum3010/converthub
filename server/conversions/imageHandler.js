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


/**
 * Rasterizes an SVG (vector) into a raster format. This is a one-way
 * operation — raster -> SVG is not a well-defined conversion without
 * vectorization, which is out of scope (see DECISIONS.md).
 *
 * SVG has no inherent pixel resolution, only whatever width/height or
 * viewBox it declares. Sharp renders at 72 DPI by default, which can
 * look soft for anything meant to be viewed/printed at real size — we
 * bump density to 300 (a standard print-quality DPI) so the rasterized
 * output is genuinely usable, not just technically non-blank.
 *
 * @param {string} inputPath - absolute path to the source .svg file
 * @param {string} outputPath - absolute path where the raster image should be written
 * @param {string} targetExt - target extension, no dot (e.g. "png")
 * @returns {Promise<void>}
 */
async function convertSvgToRaster(inputPath, outputPath, targetExt) {
  const ext = targetExt.replace(/^\./, "").toLowerCase();
  const sharpFormat = EXT_TO_SHARP_FORMAT[ext];

  if (!sharpFormat) {
    throw new Error(`Unsupported image target format: ${targetExt}`);
  }

  try {
    await sharp(inputPath, { density: 300 })
      .toFormat(sharpFormat)
      .toFile(outputPath);
  } catch (err) {
    throw new Error(`SVG rasterization failed: ${err.message}`);
  }
}

module.exports = { convertImage, convertSvgToRaster, EXT_TO_SHARP_FORMAT };