// audioHandler.js
// Wraps the `ffmpeg` CLI for audio-format cross-conversion (Task 5.13).
// Scope: audio only (mp3/wav/ogg/flac/m4a/aac), video explicitly excluded
// — see DECISIONS.md for the reasoning.

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// Duration cap (resource-exhaustion guard, same reasoning as PDF's
// MAX_PDF_PAGES and image's MAX_IMAGE_DIMENSION). The 20MB global file
// size cap (server/index.js, @fastify/multipart limits) does NOT bound
// duration on its own — a long, low-bitrate file (e.g. mono speech at a
// low sample rate) can pack hours of audio into 20MB, and ffmpeg's
// runtime scales with duration, not file size. 30 minutes is generously
// above any legitimate single-file conversion use case for this app.
const MAX_AUDIO_DURATION_SECONDS = 30 * 60;

/**
 * Reads an audio file's duration via a cheap ffprobe metadata call (no
 * decode) and throws a clean Error if it's corrupt/unreadable or exceeds
 * MAX_AUDIO_DURATION_SECONDS. Must be called before any ffmpeg conversion.
 *
 * @param {string} inputPath - absolute path to the source audio file
 * @returns {Promise<void>}
 */
async function assertValidAudio(inputPath) {
  let stdout;
  try {
    const result = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);
    stdout = result.stdout.trim();
  } catch (err) {
    // ffprobe fails cleanly on corrupt/malformed/non-audio input — surface
    // a clean rejection rather than letting ffmpeg's raw stderr through
    // later in the pipeline.
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`Audio conversion failed: file is not valid audio or is corrupted (${detail})`);
  }

  const duration = parseFloat(stdout);
  if (!stdout || Number.isNaN(duration)) {
    throw new Error(
      "Audio conversion failed: could not determine audio duration (file may be corrupt or not a supported audio format)",
    );
  }

  if (duration > MAX_AUDIO_DURATION_SECONDS) {
    throw new Error(
      `Audio conversion failed: duration (${Math.round(duration)}s) exceeds the maximum allowed (${MAX_AUDIO_DURATION_SECONDS}s / ${MAX_AUDIO_DURATION_SECONDS / 60} minutes)`,
    );
  }
}

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

  await assertValidAudio(inputPath);

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

module.exports = { convertAudio, assertValidAudio, MAX_AUDIO_DURATION_SECONDS };