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
    implemented: false,
  },
  {
    from: "md",
    to: "docx",
    engine: "pandoc",
    tier: "medium",
    implemented: false,
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
    implemented: false,
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
    implemented: false,
  },
  {
    from: "odt",
    to: "html",
    engine: "pandoc",
    tier: "medium",
    implemented: false,
  },

  // ---- LibreOffice headless (office document formats) ----
  {
    from: "docx",
    to: "pdf",
    engine: "libreoffice",
    tier: "medium",
    implemented: false,
  },
  {
    from: "xlsx",
    to: "pdf",
    engine: "libreoffice",
    tier: "medium",
    implemented: false,
  },
  {
    from: "xlsx",
    to: "csv",
    engine: "libreoffice",
    tier: "fast",
    implemented: false,
  },
  {
    from: "pptx",
    to: "pdf",
    engine: "libreoffice",
    tier: "medium",
    implemented: false,
  },
  {
    from: "pptx",
    to: "odp",
    engine: "libreoffice",
    tier: "medium",
    implemented: false,
  },

  // ---- Spreadsheet/data formats ----
  { from: "csv", to: "json", engine: "data", tier: "fast", implemented: false },
  { from: "json", to: "csv", engine: "data", tier: "fast", implemented: false },
  {
    from: "json",
    to: "yaml",
    engine: "data",
    tier: "fast",
    implemented: false,
  },
  {
    from: "yaml",
    to: "json",
    engine: "data",
    tier: "fast",
    implemented: false,
  },
  {
    from: "json",
    to: "toml",
    engine: "data",
    tier: "fast",
    implemented: false,
  },
  { from: "xml", to: "json", engine: "data", tier: "fast", implemented: false },

  // ---- LaTeX / TeX Live ----
  { from: "tex", to: "pdf", engine: "latex", tier: "slow", implemented: false },
  {
    from: "tex",
    to: "html",
    engine: "latex",
    tier: "slow",
    implemented: false,
  },

  // ---- BibTeX ----
  {
    from: "bib",
    to: "html",
    engine: "bibtex",
    tier: "fast",
    implemented: false,
  },
  {
    from: "bib",
    to: "json",
    engine: "bibtex",
    tier: "fast",
    implemented: false,
  },

  // ---- Jupyter (nbconvert) ----
  {
    from: "ipynb",
    to: "html",
    engine: "nbconvert",
    tier: "medium",
    implemented: false,
  },
  {
    from: "ipynb",
    to: "md",
    engine: "nbconvert",
    tier: "medium",
    implemented: false,
  },
  {
    from: "ipynb",
    to: "docx",
    engine: "nbconvert",
    tier: "medium",
    implemented: false,
  },
  // NOTE: ipynb -> pdf intentionally excluded (deferred, see PROJECT_OVERVIEW.md)

  // ---- Archives ----
  {
    from: "zip",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: false,
  },
  {
    from: "7z",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: false,
  },
  {
    from: "tar",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: false,
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
