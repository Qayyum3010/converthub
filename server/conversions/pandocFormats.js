// pandocFormats.js
// Maps our file extensions to Pandoc's internal format names.
// Only includes extensions actually used in registry.js's pandoc entries.

const EXT_TO_PANDOC_FORMAT = {
  md: "markdown",
  html: "html",
  htm: "html",
  // adoc intentionally NOT mapped here — Pandoc has no AsciiDoc reader
  // (confirmed via `pandoc --list-input-formats`, pandoc 2.17.1.1).
  // adoc->html routes through asciidocHandler.js (real asciidoctor CLI)
  // instead. See DECISIONS.md, 2026-09-04.
  rst: "rst",
  rtf: "rtf",
  odt: "odt",
  docx: "docx",
  pdf: "pdf", // note: pandoc can only write pdf via a LaTeX engine, not read it
  bib: "bibtex",
  tex: "latex", // added for tex->docx (Pandoc's native LaTeX reader) — note tex->pdf/html still go through latexHandler.js's dedicated engine, not this map
  pptx: "pptx", // added for md->pptx (Task 5.8.3) — Pandoc's native PPTX
                // writer, confirmed via `pandoc --list-output-formats`;
                // this is write-only for our purposes (registry.js has no
                // pandoc-engine pptx->* source pairs, only md->pptx as a
                // target), but toPandocFormat() doesn't distinguish
                // read/write direction, so one entry covers it.
                  csv: "csv", // Pandoc has a native CSV reader (renders as a table) —
              // confirmed via `pandoc --list-input-formats`, not assumed
              // from memory. Write-only entries in registry.js (csv is
              // never a pandoc-engine *target*), same read/write
              // non-distinction as the pptx entry above.
  txt: "markdown", // plain text has no markdown syntax to misinterpret, so

                   // reading .txt as Pandoc's "markdown" format is safe and
                   // is the standard workaround since Pandoc has no
                   // dedicated plain-text reader. Added for the 4 new
                   // txt->* pairs (Task 5.7, 2026-09-04) — previously
                   // missing, which made all 4 throw at runtime despite
                   // being marked implemented:true in registry.js.
};

function toPandocFormat(ext) {
  const format = EXT_TO_PANDOC_FORMAT[ext.replace(/^\./, "").toLowerCase()];
  if (!format) {
    throw new Error(`No Pandoc format mapping for extension: ${ext}`);
  }
  return format;
}

module.exports = { toPandocFormat, EXT_TO_PANDOC_FORMAT };