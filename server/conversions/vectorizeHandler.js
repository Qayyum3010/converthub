// vectorizeHandler.js
// Raster -> SVG vectorization via imagetracerjs (pure JS, no native
// binary — see DECISIONS.md for why this was chosen over potrace).
//
// This is a fundamentally lossy, heuristic operation, NOT a format
// transcode — quality depends entirely on image content. Works well for
// simple logos/icons/line art; poorly for photos (see DECISIONS.md).
// No quality/tier claims here are assumed — see the real CPU-timing test
// this task requires before finalizing a tier.

const sharp = require("sharp");
const ImageTracer = require("imagetracerjs");
const fs = require("fs/promises");

/**
 * Vectorizes a raster image into an SVG.
 *
 * imagetracerjs works on raw RGBA pixel data, not file bytes directly —
 * sharp decodes the source image (any format sharp supports) into a raw
 * pixel buffer first, which ImageTracer.imagedataToSVG then traces.
 *
 * @param {string} inputPath - absolute path to the source raster image
 * @param {string} outputPath - absolute path where the .svg should be written
 * @returns {Promise<void>}
 */
// Vectorization cost scales with edge/pixel complexity, not file size — a
// small but high-resolution or noisy image can still be pathologically
// slow (confirmed: an 800x600 pure-noise PNG exceeded 30s under a
// --cpus=0.1 constrained test, see DECISIONS.md). Downscaling large
// inputs before tracing bounds worst-case cost without meaningfully
// hurting the common case (logos/icons are rarely this large anyway).
const MAX_VECTORIZE_DIMENSION = 500;

async function convertRasterToSvg(inputPath, outputPath) {
  try {
    const { data, info } = await sharp(inputPath)
      .resize(MAX_VECTORIZE_DIMENSION, MAX_VECTORIZE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageData = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    };

    const svgString = ImageTracer.imagedataToSVG(imageData, {});
    await fs.writeFile(outputPath, svgString, "utf8");
  } catch (err) {
    throw new Error(`Raster-to-SVG vectorization failed: ${err.message}`);
  }
}

module.exports = { convertRasterToSvg };