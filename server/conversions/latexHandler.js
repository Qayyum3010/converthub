// latexHandler.js
// Wraps pdflatex (tex->pdf) and Pandoc (tex->html, reads LaTeX natively).
//
// pdflatex writes output into the CURRENT WORKING DIRECTORY using the
// input file's basename (test.tex -> test.pdf/.aux/.log), with no
// equivalent of Pandoc/LibreOffice's -o/--outdir flag. So we copy the
// input into an isolated scratch dir, run pdflatex there (via `cwd`), and
// move the resulting .pdf to the exact outputPath the app expects — same
// "isolated scratch dir + rename" pattern as libreofficeHandler.js.
//
// -interaction=nonstopmode is required: without it, pdflatex can hang
// waiting for interactive input on any error, which would hang the server
// process indefinitely. Verified: pdflatex still exits non-zero on a real
// error (undefined control sequence) even in nonstopmode, so failure
// detection via exec exit code is reliable — but pdflatex ALSO still
// writes a partial/degraded .pdf on that same error path, so output-file
// existence alone is NOT proof of success. Rely on the exit code (i.e. the
// execFileAsync rejection), not fs.existsSync, to detect failure.

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const execFileAsync = promisify(execFile);
const { convertWithPandoc } = require("./pandocHandler");

/**
 * Converts a .tex file to PDF (via pdflatex) or HTML (via Pandoc).
 *
 * @param {string} inputPath - absolute path to the source .tex file
 * @param {string} outputPath - absolute path where the converted file should be written
 * @param {string} targetFormat - "pdf" or "html"
 * @returns {Promise<void>}
 */
async function convertLatex(inputPath, outputPath, targetFormat) {
  if (targetFormat === "html") {
    // Pandoc reads LaTeX natively — no scratch dir needed, same pattern
    // as every other Pandoc-based pair.
    await convertWithPandoc(inputPath, outputPath, "latex", "html");
    return;
  }

  if (targetFormat !== "pdf") {
    throw new Error(`Unsupported LaTeX target format: ${targetFormat}`);
  }

  const scratchDir = path.join(
    os.tmpdir(),
    "converthub-latex",
    crypto.randomUUID(),
  );
  fs.mkdirSync(scratchDir, { recursive: true });

  const scratchTexPath = path.join(scratchDir, "input.tex");

  try {
    await fsp.copyFile(inputPath, scratchTexPath);

    await execFileAsync(
      "pdflatex",
      ["-interaction=nonstopmode", "-halt-on-error", scratchTexPath],
      { cwd: scratchDir },
    );

    const producedPath = path.join(scratchDir, "input.pdf");
    if (!fs.existsSync(producedPath)) {
      throw new Error(
        `pdflatex reported success but no PDF was produced: ${producedPath}`,
      );
    }

    fs.renameSync(producedPath, outputPath);
  } catch (err) {
    // pdflatex writes its actual diagnostics (undefined commands, fatal
    // errors, etc.) to stdout, not stderr — verified via the broken-fixture
    // test, where err.stderr was empty despite a clear failure reason
    // being present in stdout. Surface both, stdout first since it's the
    // one that actually has the useful detail here.
    const detail =
      (err.stdout ? err.stdout.trim() : "") ||
      (err.stderr ? err.stderr.trim() : "") ||
      err.message;
    throw new Error(`LaTeX conversion failed: ${detail}`);
  } finally {
    fs.rm(scratchDir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { convertLatex };
