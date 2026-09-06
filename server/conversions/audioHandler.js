// audioHandler.js
// Wraps the `ffmpeg` CLI for audio-format cross-conversion (Task 5.13).
// Scope: audio only (mp3/wav/ogg/flac/m4a/aac), video explicitly excluded
// — see DECISIONS.md for the reasoning.

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// Maps our target extension to the ffmpeg audio codec to encode with.
// ffmpeg can usually infer the right codec from the output filename's
// extension alone, but being explicit avoids relying on default-codec
// behavior that could change between ffmpeg versions/builds.
const EXT_TO_CODEC = {
  mp3: "libmp3lame",
  wav: "pcm_s16le",
  ogg: "libvorbis",
  flac: "flac",
  m4a: "aac", // m4a is a container; aac is the actual codec inside it
  aac: "aac",
};

/**
 * Converts an audio file using ffmpeg.
 *
 * @param {string} inputPath - absolute path to the source audio file
 * @param {string} outputPath - absolute path where the converted file should be written
 * @param {string} targetExt - target extension (e.g. "mp3", "wav") — used to pick the codec
 * @returns {Promise<void>}
 */
async function convertAudio(inputPath, outputPath, targetExt) {
  const ext = targetExt.replace(/^\./, "").toLowerCase();
  const codec = EXT_TO_CODEC[ext];
  if (!codec) {
    throw new Error(`No ffmpeg codec mapping for audio extension: ${ext}`);
  }

  try {
    await execFileAsync("ffmpeg", [
      "-y", // overwrite output if it somehow already exists
      "-i",
      inputPath,
      "-vn", // strip any video/album-art stream — audio only, per scope
      "-c:a",
      codec,
      outputPath,
    ]);
  } catch (err) {
    // ffmpeg writes useful detail to stderr on failure (e.g. corrupt/
    // malformed input) — surface it rather than a raw stack trace.
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`Audio conversion failed: ${detail}`);
  }
}

module.exports = { convertAudio };