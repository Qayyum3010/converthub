// archiveHandler.js
// Wraps 7z, unrar, and native tar for archive-format conversion via an
// extract-then-repack pattern (7z/tar have no single "convert" command).
//
// Supported sources: zip, 7z, tar, tar.gz, rar
// Supported targets: zip, 7z, tar, tar.gz   (rar is source-only — there is
//   no free/legal RAR encoder, so we never write .rar files, only read them)
//
// rar extraction uses the standalone `unrar` binary, NOT `7z x` — p7zip's 7z
// has no built-in RAR support (that requires the proprietary, unpackaged
// p7zip-rar plugin); `unrar` is a separate tool with its own CLI syntax.
//
// tar.gz is handled natively via `tar -xzf` / `tar -czf` in a single step —
// no need to unwrap gzip and tar separately, since GNU tar handles both
// layers of a .tar.gz in one command for both directions.

const { execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Converts an archive from one format to another via extract-then-repack.
 *
 * @param {string} inputPath - absolute path to the source archive
 * @param {string} outputPath - absolute path where the converted archive should be written
 * @param {string} targetFormat - target archive extension, no dot (e.g. "7z", "zip", "tar", "tar.gz")
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
    // Detect source format the same way registry.js's normalizeExt() does —
    // check the compound ".tar.gz" case before falling back to the simple
    // single-segment extension.
    const lowerInput = inputPath.toLowerCase();
    const sourceFormat = lowerInput.endsWith(".tar.gz")
      ? "tar.gz"
      : path.extname(inputPath).slice(1).toLowerCase();

    // --- Step 1: extract ---
    if (sourceFormat === "rar") {
      // unrar's "x" extracts with full paths preserved (like "7z x"); the
      // trailing slash on extractDir is required by unrar's own syntax to
      // be recognized as a destination directory rather than a file.
      await execFileAsync("unrar", ["x", "-y", inputPath, `${extractDir}/`]);
    } else if (sourceFormat === "tar.gz") {
      await execFileAsync("tar", ["-xzf", inputPath, "-C", extractDir]);
    } else {
      // zip, 7z, tar
      await execFileAsync("7z", ["x", inputPath, `-o${extractDir}`, "-y"]);
    }

    const extractedEntries = await fsp.readdir(extractDir);
    if (extractedEntries.length === 0) {
      throw new Error("Archive extracted but contained no files.");
    }

    // --- Step 2: repack ---
    if (targetFormat === "tar") {
      await execFileAsync("tar", [
        "-cf",
        outputPath,
        "-C",
        extractDir,
        ...extractedEntries,
      ]);
    } else if (targetFormat === "tar.gz") {
      await execFileAsync("tar", [
        "-czf",
        outputPath,
        "-C",
        extractDir,
        ...extractedEntries,
      ]);
    } else {
      // zip, 7z — 7z infers archive type from outputPath's extension. Run
      // with cwd = extractDir and pass only relative filenames so 7z stores
      // clean entry names instead of leaking the scratch-dir UUID path.
      await execFileAsync("7z", ["a", outputPath, ...extractedEntries, "-y"], {
        cwd: extractDir,
      });
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