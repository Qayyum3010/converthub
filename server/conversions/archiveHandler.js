// archiveHandler.js
// Wraps 7z for archive-format conversion. 7z has no single "convert" command
// (unlike Pandoc/LibreOffice's --convert-to) — every conversion is genuinely
// a two-step extract-then-repack: `7z x` into a scratch dir, then `7z a` the
// extracted contents into a new archive of the target format. 7z infers
// output format from the target filename's extension, so no extra format
// flag is needed on the `a` step.
//
// tar is a special case: 7z can read tar natively via `x`, but for *creating*
// a tar output we shell out to the system `tar` binary instead, since 7z's
// own tar-writing support is inconsistent across format pairs — using the
// native tool for tar output avoids relying on 7z behavior we haven't
// separately verified for that direction.

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const execFileAsync = promisify(execFile);

/**
 * Converts an archive from one format to another via extract-then-repack.
 *
 * @param {string} inputPath - absolute path to the source archive
 * @param {string} outputPath - absolute path where the converted archive should be written
 * @param {string} targetFormat - target archive extension, no dot (e.g. "7z", "zip", "tar")
 * @returns {Promise<void>}
 */
async function convertArchive(inputPath, outputPath, targetFormat) {
  const scratchDir = path.join(
    os.tmpdir(),
    "converthub-archive",
    crypto.randomUUID(),
  );
  const extractDir = path.join(scratchDir, "extracted");
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // Step 1: extract source archive with full paths preserved
    await execFileAsync("7z", ["x", inputPath, `-o${extractDir}`, "-y"]);
    let extractedEntries = await fsp.readdir(extractDir);
    if (extractedEntries.length === 0) {
      throw new Error("Archive extracted but contained no files.");
    }

    // Single-stream sources (gz/bz2/xz) that were compressed via our own
    // "tar first" fix unwrap to a single .tar file, not the real payload —
    // extract that inner tar too so we reach the actual files, not a tar
    // treated as if it were content. Loop (not just one extra pass) in case
    // of doubly-wrapped inputs from elsewhere.
    while (
      extractedEntries.length === 1 &&
      extractedEntries[0].toLowerCase().endsWith(".tar")
    ) {
      const innerTarPath = path.join(extractDir, extractedEntries[0]);
      await execFileAsync("7z", ["x", innerTarPath, `-o${extractDir}`, "-y"]);
      await fsp.unlink(innerTarPath);
      extractedEntries = await fsp.readdir(extractDir);
    }

    // Single-stream compressors (gz/bz2/xz) can only compress ONE input —
    // 7z hard-errors (E_INVALIDARG) if given multiple files. Standard
    // practice is to tar the contents first, then compress the tar stream
    // (the .tar.gz pattern), so we do that unconditionally for these
    // formats rather than special-casing single- vs multi-file inputs.
    const SINGLE_STREAM_FORMATS = new Set(["gz", "bz2", "xz"]);

    if (targetFormat === "tar") {
      // Use native tar for tar output (see file header note above)
      await execFileAsync("tar", [
        "-cf",
        outputPath,
        "-C",
        extractDir,
        ...extractedEntries,
      ]);
    } else if (SINGLE_STREAM_FORMATS.has(targetFormat)) {
      const tarScratchPath = path.join(scratchDir, "bundle.tar");
      await execFileAsync("tar", [
        "-cf",
        tarScratchPath,
        "-C",
        extractDir,
        ...extractedEntries,
      ]);
      // 7z infers compressor from outputPath's extension
      await execFileAsync("7z", ["a", outputPath, tarScratchPath, "-y"]);
    } else {
      // 7z infers archive type from outputPath's extension (zip, 7z, etc.)
      await execFileAsync("7z", [
        "a",
        outputPath,
        ...extractedEntries.map((f) => path.join(extractDir, f)),
        "-y",
      ]);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Archive conversion reported success but output was not found: ${outputPath}`,
      );
    }
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`Archive conversion failed: ${detail}`);
  } finally {
    fs.rm(scratchDir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { convertArchive };
