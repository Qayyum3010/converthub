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

    const extractedEntries = await fsp.readdir(extractDir);
    if (extractedEntries.length === 0) {
      throw new Error("Archive extracted but contained no files.");
    }

    // Step 2: repack into the target format
    if (targetFormat === "tar") {
      // Use native tar for tar output (see file header note above)
      await execFileAsync("tar", [
        "-cf",
        outputPath,
        "-C",
        extractDir,
        ...extractedEntries,
      ]);
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
