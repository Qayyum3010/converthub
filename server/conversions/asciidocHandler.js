// asciidocHandler.js
// Wraps the asciidoctor CLI (Ruby gem, installed in the Dockerfile) for
// AsciiDoc -> HTML. Pandoc cannot do this pair — despite an EXT_TO_PANDOC_FORMAT
// entry once claiming otherwise, Pandoc has never shipped an AsciiDoc *reader*
// (only ever a writer). Confirmed via `pandoc --list-input-formats` against
// pandoc 2.17.1.1: "asciidoc" is absent. See DECISIONS.md, 2026-09-04.

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Converts a .adoc file to HTML using asciidoctor.
 *
 * @param {string} inputPath - absolute path to the source .adoc file
 * @param {string} outputPath - absolute path where the converted file should be written
 * @returns {Promise<void>}
 */
async function convertAsciidoc(inputPath, outputPath) {
  try {
    await execFileAsync("asciidoctor", [inputPath, "-o", outputPath]);
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`AsciiDoc conversion failed: ${detail}`);
  }
}

module.exports = { convertAsciidoc };
