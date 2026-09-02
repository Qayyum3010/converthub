// pandocFormats.js
// Maps our file extensions to Pandoc's internal format names.
// Only includes extensions actually used in registry.js's pandoc entries.

const EXT_TO_PANDOC_FORMAT = {
  md: "markdown",
  html: "html",
  htm: "html",
  adoc: "asciidoc",
  rst: "rst",
  rtf: "rtf",
  odt: "odt",
  docx: "docx",
  pdf: "pdf", // note: pandoc can only write pdf via a LaTeX engine, not read it
  bib: "bibtex",
  tex: "latex", // added for tex->docx (Pandoc's native LaTeX reader) — note tex->pdf/html still go through latexHandler.js's dedicated engine, not this map
};

function toPandocFormat(ext) {
  const format = EXT_TO_PANDOC_FORMAT[ext.replace(/^\./, "").toLowerCase()];
  if (!format) {
    throw new Error(`No Pandoc format mapping for extension: ${ext}`);
  }
  return format;
}

module.exports = { toPandocFormat, EXT_TO_PANDOC_FORMAT };
