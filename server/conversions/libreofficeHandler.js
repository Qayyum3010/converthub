// libreofficeHandler.js
// Wraps `soffice --headless --convert-to` for office document conversions
// (DOCX/XLSX/PPTX <-> PDF, XLSX->CSV, PPTX->ODP, etc).
//
// LibreOffice's headless CLI doesn't let you name the output file directly —
// it writes <basename>.<ext> into --outdir using the *input's* basename.
// So we run it into a scratch dir, then move/rename the result to the exact
// outputPath the rest of the app expects (same contract as convertWithPandoc).

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const execFileAsync = promisify(execFile);

/**
 * Converts a file using LibreOffice headless.
 *
 * @param {string} inputPath - absolute path to the source file
 * @param {string} outputPath - absolute path where the converted file should end up
 * @param {string} targetFormat - LibreOffice --convert-to filter/extension (e.g. "pdf", "csv", "odp")
 * @returns {Promise<void>}
 */
async function convertWithLibreOffice(
  inputPath,
  outputPath,
  targetFormat,
  infilter = null,
  originalFilename = null,
) {
  // Isolated scratch dir per job — avoids collisions if multiple jobs with
  // the same input basename run concurrently, and keeps --outdir predictable.
  const scratchDir = path.join(
    os.tmpdir(),
    "converthub-libreoffice",
    crypto.randomUUID(),
  );
  fs.mkdirSync(scratchDir, { recursive: true });

  // Uploaded files live on disk as "{fileId}.{ext}" (see registry.js/upload
  // route notes). LibreOffice opens whatever path we hand it, and if the
  // source document has a dynamic "filename" header/footer field (e.g.
  // Excel/Calc's &[File]), that field re-evaluates against the ACTUAL
  // opened path at export time — so the raw fileId ends up baked into the
  // rendered PDF/output instead of anything meaningful. Copying the input
  // into the scratch dir under its original (sanitized) filename before
  // conversion means any such dynamic field resolves to something sensible
  // instead of a UUID. Falls back to the existing fileId-based basename
  // when no original filename is available (keeps old callers working).
  // See DECISIONS.md, 2026-09-08.
  const sourceExt = path.extname(inputPath);
  const safeOriginalBase = originalFilename
    ? path.basename(originalFilename, path.extname(originalFilename)).replace(/["\r\n/\\]/g, "_")
    : path.basename(inputPath, sourceExt);
  const workingInputPath = path.join(scratchDir, `${safeOriginalBase}${sourceExt}`);
  fs.copyFileSync(inputPath, workingInputPath);

  // LibreOffice headless uses a single shared user-profile lock by default —
  // concurrent soffice invocations fight over it, and the loser exits early
  // printing only the harmless "javaldx" startup warning as its sole stderr
  // output, which then gets mistaken for the real error. Isolating the
  // profile per invocation (same idea as the already-isolated scratchDir)
  // eliminates the lock contention entirely. Verified against a real
  // concurrent docx+html overlap, 2026-09-03 — see DECISIONS.md.
  const profileDir = path.join(scratchDir, "loprofile");

  // Some inputs (notably PDF) have no unambiguous default LibreOffice
  // document type — a PDF opened with no filter specified defaults to
  // Draw, which can export HTML but silently produces nothing for a
  // Writer-only target like DOCX (soffice exits 0 either way).
  //
  // NOTE: the `format:filtername` suffix on --convert-to sets the EXPORT
  // filter, not the import filter — that was the bug in the first attempt
  // (docx:writer_pdf_import silently no-ops since writer_pdf_import isn't
  // a valid docx export filter). Forcing the *import* path requires the
  // separate --infilter CLI flag instead. See DECISIONS.md, 2026-09-03.
  const args = ["--headless", `-env:UserInstallation=file://${profileDir}`];

  if (infilter) {
    args.push(`--infilter=${infilter}`);
  }

  args.push("--convert-to", targetFormat, "--outdir", scratchDir, workingInputPath);

  try {
    await execFileAsync("soffice", args);

    const producedPath = path.join(
      scratchDir,
      `${safeOriginalBase}.${targetFormat}`,
    );

    if (!fs.existsSync(producedPath)) {
      throw new Error(
        `LibreOffice reported success but expected output was not found: ${producedPath}`,
      );
    }

    fs.renameSync(producedPath, outputPath);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`LibreOffice conversion failed: ${detail}`);
  } finally {
    fs.rm(scratchDir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { convertWithLibreOffice };
