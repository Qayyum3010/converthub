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
  { from: "md", to: "html", engine: "pandoc", tier: "fast", implemented: true },
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
  { from: "html", to: "md", engine: "pandoc", tier: "fast", implemented: true },
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
    engine: "asciidoc",
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

  // ---- Task 5.10.2: RST made bidirectional ----
  { from: "rst", to: "pdf", engine: "pandoc", tier: "medium", implemented: true },
  { from: "rst", to: "docx", engine: "pandoc", tier: "medium", implemented: true },
  { from: "rst", to: "md", engine: "pandoc", tier: "medium", implemented: true },
  { from: "rst", to: "txt", engine: "pandoc", tier: "fast", implemented: true },
  { from: "md", to: "rst", engine: "pandoc", tier: "medium", implemented: true },
  { from: "html", to: "rst", engine: "pandoc", tier: "medium", implemented: true },
  { from: "txt", to: "rst", engine: "pandoc", tier: "fast", implemented: true },
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
    tier: "slow",
    implemented: true,
  },
  {
    from: "xlsx",
    to: "pdf",
    engine: "libreoffice",
    tier: "slow",
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
    tier: "slow",
    implemented: true,
  },
  {
    from: "pptx",
    to: "odp",
    engine: "libreoffice",
    tier: "slow",
    implemented: true,
  },

  // ---- Spreadsheet/data formats ----
  { from: "csv", to: "json", engine: "data", tier: "fast", implemented: true },
  { from: "json", to: "csv", engine: "data", tier: "fast", implemented: true },
  { from: "json", to: "yaml", engine: "data", tier: "fast", implemented: true },
  { from: "yaml", to: "json", engine: "data", tier: "fast", implemented: true },
  { from: "json", to: "toml", engine: "data", tier: "fast", implemented: true },
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
  { from: "tex", to: "pdf", engine: "latex", tier: "slow", implemented: true },
  { from: "tex", to: "html", engine: "latex", tier: "slow", implemented: true },
  {
    from: "tex",
    to: "docx",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },

  // ---- Task 5.10.4: LaTeX further connected (pandoc, no compilation) ----
  { from: "md", to: "tex", engine: "pandoc", tier: "medium", implemented: true },
  { from: "rst", to: "tex", engine: "pandoc", tier: "medium", implemented: true },
  { from: "html", to: "tex", engine: "pandoc", tier: "medium", implemented: true },
  { from: "tex", to: "md", engine: "pandoc", tier: "medium", implemented: true },
  { from: "tex", to: "txt", engine: "pandoc", tier: "fast", implemented: true },

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

  // ---- PDF as source (Task 5.6) ----
  // Handled by pdfConvertHandler.js, not pdfHandler.js (which owns the
  // dedicated PDF Tools merge/split/compress/compare/analyze endpoints).
  // All four auto-OCR scanned/image PDFs via the same Tesseract fallback
  // Analyze already uses — see DECISIONS.md, 2026-09-03.
  {
    from: "pdf",
    to: "txt",
    engine: "pdfConvert",
    tier: "slow",
    implemented: true,
  },
  {
    from: "pdf",
    to: "docx",
    engine: "pdfConvert",
    tier: "slow",
    implemented: true,
  },
  {
    from: "pdf",
    to: "html",
    engine: "pdfConvert",
    tier: "slow",
    implemented: true,
  },
  {
    from: "pdf",
    to: "md",
    engine: "pdfConvert",
    tier: "slow",
    implemented: true,
  },

  // ---- Plain text (Task: txt + archive expansion, 2026-09-04) ----
  // docx/html -> txt route through LibreOffice (--convert-to txt), which
  // handles real document structure more reliably than Pandoc's plain-text
  // writer. txt -> * routes through Pandoc, reading the .txt as plain
  // markdown source — safe because txt carries no formatting to lose or
  // misinterpret. pdf -> txt already existed above under pdfConvert.
  {
    from: "docx",
    to: "txt",
    engine: "libreoffice",
    tier: "slow",
    implemented: true,
  },
  {
    from: "html",
    to: "txt",
    engine: "libreoffice",
    tier: "fast",
    implemented: true,
  },
  {
    from: "txt",
    to: "docx",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  {
    from: "txt",
    to: "pdf",
    engine: "pandoc",
    tier: "medium",
    implemented: true,
  },
  {
    from: "txt",
    to: "html",
    engine: "pandoc",
    tier: "fast",
    implemented: true,
  },
  { from: "txt", to: "md", engine: "pandoc", tier: "fast", implemented: true },

  // ---- Task 5.10.1: critical gaps in docx/md family ----
  { from: "docx", to: "md", engine: "pandoc", tier: "medium", implemented: true },
  { from: "md", to: "txt", engine: "pandoc", tier: "fast", implemented: true },

  // ---- Archives (rewritten 2026-09-04: zip/7z/tar/tar.gz core, rar
  // extract-only. gz/bz2/xz dropped as standalone targets/sources — see
  // DECISIONS.md, 2026-09-04, for the tar.gz-as-compound-format rationale
  // and why rar can't be a conversion target (proprietary compressor). ----
  {
    from: "zip",
    to: "7z",
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
    to: "tar.gz",
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
    from: "7z",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "7z",
    to: "tar.gz",
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
    from: "tar",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar",
    to: "tar.gz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar.gz",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar.gz",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "tar.gz",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  // rar as source only — extraction via 7z, no free/open way to create rar
  {
    from: "rar",
    to: "zip",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "rar",
    to: "7z",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "rar",
    to: "tar",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },
  {
    from: "rar",
    to: "tar.gz",
    engine: "archive",
    tier: "medium",
    implemented: true,
  },

    // --- Task 5.8.1: Office document family (19 pairs) ---
  { from: "doc", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "doc", to: "docx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "doc", to: "odt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "doc", to: "html", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "doc", to: "txt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "docx", to: "doc", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "docx", to: "odt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odt", to: "docx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odt", to: "doc", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odt", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odt", to: "txt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "rtf", to: "pdf", engine: "pandoc", tier: "medium", implemented: true },
  { from: "rtf", to: "html", engine: "pandoc", tier: "medium", implemented: true },
  { from: "rtf", to: "odt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "docx", to: "rtf", engine: "pandoc", tier: "medium", implemented: true },
  { from: "md", to: "rtf", engine: "pandoc", tier: "medium", implemented: true },
  { from: "md", to: "odt", engine: "pandoc", tier: "medium", implemented: true },
  { from: "html", to: "docx", engine: "pandoc", tier: "medium", implemented: true },
    { from: "html", to: "odt", engine: "pandoc", tier: "medium", implemented: true },

  // ---- Spreadsheet family (Task 5.8.2) ----
  { from: "xls", to: "xlsx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "xls", to: "csv", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "xls", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "xls", to: "ods", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "xlsx", to: "ods", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "xlsx", to: "xls", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "csv", to: "xlsx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "csv", to: "ods", engine: "libreoffice", tier: "slow", implemented: true },

  // ---- Task 5.10.3: direct CSV-to-document pairs (pandoc native reader) ----
  { from: "csv", to: "pdf", engine: "pandoc", tier: "medium", implemented: true },
  { from: "csv", to: "docx", engine: "pandoc", tier: "medium", implemented: true },
  { from: "csv", to: "html", engine: "pandoc", tier: "medium", implemented: true },
  { from: "csv", to: "odt", engine: "pandoc", tier: "medium", implemented: true },
  { from: "csv", to: "md", engine: "pandoc", tier: "medium", implemented: true },
  { from: "json", to: "xlsx", engine: "data", tier: "slow", implemented: true },
  { from: "ods", to: "xlsx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "ods", to: "xls", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "ods", to: "csv", engine: "libreoffice", tier: "slow", implemented: true },
    { from: "ods", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },

  // ---- Presentation family + BibTeX (Task 5.8.3) ----
  { from: "ppt", to: "pptx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "ppt", to: "odp", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "ppt", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "pptx", to: "ppt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odp", to: "pptx", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odp", to: "ppt", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "odp", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "md", to: "pptx", engine: "pandoc", tier: "medium", implemented: true },
  { from: "svg", to: "pdf", engine: "libreoffice", tier: "slow", implemented: true },
  { from: "bib", to: "xml", engine: "bibtex", tier: "fast", implemented: true },

  // ---- Raster image cross-matrix (Task 5.9.2) ----
  // Tier TBD — every pair below is provisionally "fast" (sharp/libvips is
  // typically sub-second per the task's own scope note), but this must be
  // confirmed against a real large-file timing test before treating it as
  // final, same discipline as every other tier decision so far.
  { from: "jpg", to: "png", engine: "image", tier: "fast", implemented: true },
  { from: "jpg", to: "webp", engine: "image", tier: "fast", implemented: true },
  { from: "jpg", to: "gif", engine: "image", tier: "fast", implemented: true },
  { from: "jpg", to: "tiff", engine: "image", tier: "fast", implemented: true },
  { from: "jpg", to: "avif", engine: "image", tier: "fast", implemented: true },
  { from: "png", to: "jpg", engine: "image", tier: "fast", implemented: true },
  { from: "png", to: "webp", engine: "image", tier: "fast", implemented: true },
  { from: "png", to: "gif", engine: "image", tier: "fast", implemented: true },
  { from: "png", to: "tiff", engine: "image", tier: "fast", implemented: true },
  { from: "png", to: "avif", engine: "image", tier: "fast", implemented: true },
  { from: "webp", to: "jpg", engine: "image", tier: "fast", implemented: true },
  { from: "webp", to: "png", engine: "image", tier: "fast", implemented: true },
  { from: "webp", to: "gif", engine: "image", tier: "fast", implemented: true },
  { from: "webp", to: "tiff", engine: "image", tier: "fast", implemented: true },
  { from: "webp", to: "avif", engine: "image", tier: "fast", implemented: true },
  { from: "gif", to: "jpg", engine: "image", tier: "fast", implemented: true },
  { from: "gif", to: "png", engine: "image", tier: "fast", implemented: true },
  { from: "gif", to: "webp", engine: "image", tier: "fast", implemented: true },
  { from: "gif", to: "tiff", engine: "image", tier: "fast", implemented: true },
  { from: "gif", to: "avif", engine: "image", tier: "fast", implemented: true },
  { from: "tiff", to: "jpg", engine: "image", tier: "fast", implemented: true },
  { from: "tiff", to: "png", engine: "image", tier: "fast", implemented: true },
  { from: "tiff", to: "webp", engine: "image", tier: "fast", implemented: true },
  { from: "tiff", to: "gif", engine: "image", tier: "fast", implemented: true },
  { from: "tiff", to: "avif", engine: "image", tier: "fast", implemented: true },
  { from: "avif", to: "jpg", engine: "image", tier: "fast", implemented: true },
  { from: "avif", to: "png", engine: "image", tier: "fast", implemented: true },
  { from: "avif", to: "webp", engine: "image", tier: "fast", implemented: true },
  { from: "avif", to: "gif", engine: "image", tier: "fast", implemented: true },
  { from: "avif", to: "tiff", engine: "image", tier: "fast", implemented: true },

  // ---- SVG rasterization (Task 5.9.3) ----
  // One-way: raster -> svg intentionally excluded (see DECISIONS.md).
  // Coexists with the existing `svg -> pdf` (LibreOffice, Task 5.8.3)
  // entry above — different engine, same source format, no conflict.
  { from: "svg", to: "jpg", engine: "image", tier: "fast", implemented: true },
  { from: "svg", to: "png", engine: "image", tier: "fast", implemented: true },
  { from: "svg", to: "webp", engine: "image", tier: "fast", implemented: true },
  { from: "svg", to: "gif", engine: "image", tier: "fast", implemented: true },
  { from: "svg", to: "tiff", engine: "image", tier: "fast", implemented: true },
  { from: "svg", to: "avif", engine: "image", tier: "fast", implemented: true },

  // ---- Raster -> SVG vectorization (v2, gated behind real CPU test) ----
  // Tier intentionally left unset/placeholder until the --cpus=0.1 Render
  // free-tier timing test (see DECISIONS.md) is actually run — do NOT
  // treat "medium" below as validated, it's a starting guess only.
  { from: "jpg", to: "svg", engine: "vectorize", tier: "slow", implemented: true },
  { from: "png", to: "svg", engine: "vectorize", tier: "slow", implemented: true },
  { from: "webp", to: "svg", engine: "vectorize", tier: "slow", implemented: true },

  // ---- HEIC support (Task 5.9.4) ----
  { from: "heic", to: "jpg", engine: "heic", tier: "fast", implemented: true },
  { from: "heic", to: "png", engine: "heic", tier: "fast", implemented: true },
  { from: "jpg", to: "heic", engine: "heic", tier: "fast", implemented: true },
  { from: "png", to: "heic", engine: "heic", tier: "fast", implemented: true },
];

// tar.gz is a compound extension (two dots) — findConversion/validatePair
// need to normalize ".tar.gz" the same way they normalize a plain
// single-part extension, since path.extname() and simple `.replace(/^\./, "")`
// callers upstream may hand us "tar.gz" without a leading dot already.
// This mirrors how the rest of registry.js already expects a bare,
// no-leading-dot, lowercased extension string.
function normalizeExt(ext) {
  return ext.replace(/^\./, "").toLowerCase();
}

function findConversion(from, to) {
  const normalizedFrom = normalizeExt(from);
  const normalizedTo = normalizeExt(to);
  return CONVERSIONS.find(
    (c) => c.from === normalizedFrom && c.to === normalizedTo,
  );
}

function validatePair(from, to) {
  const normalizedFrom = normalizeExt(from);
  const normalizedTo = normalizeExt(to);
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

function getImplementedFormats() {
  const map = {};
  for (const c of CONVERSIONS) {
    if (!c.implemented) continue;
    if (!map[c.from]) map[c.from] = [];
    map[c.from].push(c.to);
  }
  return map;
}

module.exports = {
  CONVERSIONS,
  findConversion,
  validatePair,
  getImplementedFormats,
};
