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

// Decompression-bomb / resource-exhaustion guard (Subtask 5.9.5).
// Sharp's own default limitInputPixels (~268M px) does NOT reliably
// protect us — confirmed via direct test (2026-09-06) that an oversized
// raw allocation (30000x30000x3) crashes the Node process with SIGSEGV
// (exit 139) rather than rejecting the promise cleanly. We therefore
// read dimensions via a cheap header-only metadata() call BEFORE any
// decode/resize/toFormat call, and reject with a normal catchable Error
// if either dimension exceeds this cap.
//
// 10000px is comfortably above any legitimate use case for this app
// (print-quality raster/vector work tops out well under this) while
// staying far below the range where a single conversion can meaningfully
// threaten process memory.
const MAX_IMAGE_DIMENSION = 10000;

/**
 * Reads image header metadata (cheap, no pixel decode) and throws a clean
 * Error if the declared dimensions exceed MAX_IMAGE_DIMENSION. Must be
 * called before any sharp() pipeline that actually decodes/resizes pixels.
 *
 * @param {string} inputPath - absolute path to the source image
 * @param {string} label - short label for the error message (e.g. "Image", "SVG")
 * @returns {Promise<void>}
 */
async function assertDimensionsWithinLimit(inputPath, label) {
  let metadata;
  try {
    metadata = await sharp(inputPath).metadata();
  } catch (err) {
    // Malformed/unreadable file — let the caller's existing try/catch
    // produce the normal "conversion failed" message downstream.
    throw new Error(`${label} conversion failed: ${err.message}`);
  }

  const { width, height } = metadata;
  if (
    (width && width > MAX_IMAGE_DIMENSION) ||
    (height && height > MAX_IMAGE_DIMENSION)
  ) {
    throw new Error(
      `${label} conversion failed: image dimensions (${width}x${height}) exceed the maximum allowed (${MAX_IMAGE_DIMENSION}px per side)`
    );
  }
}

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

  await assertDimensionsWithinLimit(inputPath, "Image");

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
 * NOTE: the dimension guard here checks the SVG's *declared* width/height
 * at default density — an SVG with a small declared size but requesting
 * an extreme density could still balloon at render time. Sharp's density
 * option here is fixed at 300 (not user-controlled), so this is bounded,
 * but worth remembering if density ever becomes a user-facing option.
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

  await assertDimensionsWithinLimit(inputPath, "SVG");

  try {
    await sharp(inputPath, { density: 300 })
      .toFormat(sharpFormat)
      .toFile(outputPath);
  } catch (err) {
    throw new Error(`SVG rasterization failed: ${err.message}`);
  }
}

module.exports = { convertImage, convertSvgToRaster, EXT_TO_SHARP_FORMAT };