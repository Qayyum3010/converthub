// registry.js
// Central source of truth for supported format-pair conversions.
// Each entry: { from, to, engine, tier }
// - engine: which handler module processes this pair
// - tier: which jobRunner timeout tier applies (fast | medium | slow)
//
// Task 5 builds handlers incrementally — only pairs with a real handler
// wired up should be marked `implemented: true`. Unimplemented pairs are
// still listed (so validation errors are accurate: "not yet supported"
// vs "will never be supported") but rejected until their handler exists.

const CONVERSIONS = [
  // ---- Pandoc-based (lightweight markup / text formats) ----
  {
    from: "md",
    to: "html",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  {
    from: "md",
    to: "pdf",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },
  {
    from: "md",
    to: "docx",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },
  {
    from: "html",
    to: "md",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  {
    from: "html",
    to: "pdf",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },
  {
    from: "adoc",
    to: "html",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  {
    from: "rst",
    to: "html",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  {
    from: "rtf",
    to: "docx",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },
  {
    from: "odt",
    to: "html",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },

  // ---- LibreOffice headless (office document formats) ----
  {
    from: "docx",
    to: "pdf",
    engine: "libreoffice",
    tier: "medium",
    implemented: true,
  },
  {
    from: "xlsx",
    to: "pdf",
    engine: "libreoffice",
    tier: "medium",
    implemented: true,
  },
  {
    from: "xlsx",
    to: "csv",
    engine: "libreoffice",
    tier: "fast",
    implemented: true,
  },
  {
    from: "pptx",
    to: "pdf",
    engine: "libreoffice",
    tier: "medium",
    implemented: true,
  },
  {
    from: "pptx",
    to: "odp",
    engine: "libreoffice",
    tier: "medium",
    implemented: true,
  },

  // ---- Spreadsheet/data formats ----
  { from: "csv", to: "json", engine: "data", tier: "fast", implemented: true },
  { from: "json", to: "csv", engine: "data", tier: "fast", implemented: true },
  {
    from: "json",
    to: "yaml",
    engine: "data",
    tier: "fast",
    implemented: true,
  },
  {
    from: "yaml",
    to: "json",
    engine: "data",
    tier: "fast",
    implemented: true,
  },
  {
    from: "json",
    to: "toml",
    engine: "data",
    tier: "fast",
    implemented: true,
  },
  { from: "xml", to: "json", engine: "data", tier: "fast", implemented: true },
  { from: "csv", to: "xml", engine: "data", tier: "fast", implemented: true },
  { from: "xml", to: "csv", engine: "data", tier: "fast", implemented: true },
  { from: "csv", to: "yaml", engine: "data", tier: "fast", implemented: true },
  { from: "yaml", to: "csv", engine: "data", tier: "fast", implemented: true },
  { from: "json", to: "xml", engine: "data", tier: "fast", implemented: true },
  { from: "yaml", to: "xml", engine: "data", tier: "fast", implemented: true },
  { from: "xml", to: "yaml", engine: "data", tier: "fast", implemented: true },
  { from: "toml", to: "json", engine: "data", tier: "fast", implemented: true },
  { from: "toml", to: "yaml", engine: "data", tier: "fast", implemented: true },
  { from: "yaml", to: "toml", engine: "data", tier: "fast", implemented: true },
  { from: "toml", to: "xml", engine: "data", tier: "fast", implemented: true },
  { from: "xml", to: "toml", engine: "data", tier: "fast", implemented: true },
  { from: "toml", to: "csv", engine: "data", tier: "fast", implemented: true },
  { from: "csv", to: "toml", engine: "data", tier: "fast", implemented: true },

  // ---- LaTeX / TeX Live ----
  // ---- LaTeX / TeX Live ----
  { from: "tex", to: "pdf", engine: "latex", tier: "slow", implemented: true },
  {
    from: "tex",
    to: "html",
    engine: "latex",
    tier: "slow",
    implemented: true,
  },
  {
    from: "tex",
    to: "docx",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },

  // ---- BibTeX ----
  {
    from: "bib",
    to: "html",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  {
    from: "bib",
    to: "json",
    engine: "bibtex",
    tier: "fast",
    implemented: true,
  },

  // ---- Jupyter (nbconvert) ----
  {
    from: "ipynb",
    to: "html",
    engine: "nbconvert",
    tier: "medium",
    implemented: true,
  },
  {
    from: "ipynb",
    to: "md",
    engine: "nbconvert",
    tier: "medium",
    implemented: true,
  },
  {
    from: "ipynb",
    to: "docx",
    engine: "nbconvert",
    tier: "slow",
    implemented: true,
  },
  // NOTE: ipynb -> pdf intentionally excluded (deferred, see PROJECT_OVERVIEW.md)

  // ---- Archives ----
  {
    from: "zip",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "7z",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "zip",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "zip",
    to: "gz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "zip",
    to: "bz2",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "zip",
    to: "xz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "7z",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "7z",
    to: "gz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "7z",
    to: "bz2",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "7z",
    to: "xz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar",
    to: "gz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar",
    to: "bz2",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar",
    to: "xz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "gz",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "gz",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "gz",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "bz2",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "bz2",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "bz2",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "xz",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "xz",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "xz",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
];

function findConversion(from, to) {
  const normalizedFrom = from.replace(/^\./, "").toLowerCase();
  const normalizedTo = to.replace(/^\./, "").toLowerCase();
  return CONVERSIONS.find(
    (c) => c.from === normalizedFrom && c.to === normalizedTo,
  );
}

function validatePair(from, to) {
  const normalizedFrom = from.replace(/^\./, "").toLowerCase();
  const normalizedTo = to.replace(/^\./, "").toLowerCase();
  const match = findConversion(normalizedFrom, normalizedTo);

  if (!match) {
    return {
      valid: false,
      reason: `Unsupported conversion: ${normalizedFrom} → ${normalizedTo} is not a recognized format pair.`,
    };
  }

  if (!match.implemented) {
    return {
      valid: false,
      reason: `${normalizedFrom} → ${normalizedTo} is a planned conversion but not yet implemented.`,
    };
  }

  return { valid: true, conversion: match };
}

module.exports = { CONVERSIONS, findConversion, validatePair };
