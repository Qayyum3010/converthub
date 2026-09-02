// bibtexHandler.js
// Small custom BibTeX -> JSON parser. Deliberately hand-rolled rather than
// pulling in a dependency — see DECISIONS.md for the reasoning (the two
// candidate npm packages were either stale or a massive NLP-laden
// over-fit for this narrow, well-bounded parsing problem). No shell-out,
// pure JS — same "fast tier" pattern as dataHandler.js.

const fs = require("fs/promises");

// Matches: @type{key, ...fields... }
// Entries can span multiple lines; fields are comma-separated
// "name = {value}" or "name = "value"" pairs.
const ENTRY_RE = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
const FIELD_RE = /(\w+)\s*=\s*[{"]([^}"]*)[}"]/g;

/**
 * Parses raw BibTeX text into an array of clean entry objects.
 *
 * @param {string} raw - raw .bib file contents
 * @returns {Array<Object>} - one object per entry, e.g.
 *   { type: "article", key: "smith2020", author: "Smith, John", title: "...", ... }
 */
function parseBibtex(raw) {
  const entries = [];
  let match;

  ENTRY_RE.lastIndex = 0;
  while ((match = ENTRY_RE.exec(raw)) !== null) {
    const [, type, key, body] = match;
    const entry = { type: type.toLowerCase(), key: key.trim() };

    let fieldMatch;
    FIELD_RE.lastIndex = 0;
    while ((fieldMatch = FIELD_RE.exec(body)) !== null) {
      const [, fieldName, fieldValue] = fieldMatch;
      entry[fieldName.toLowerCase()] = fieldValue.trim();
    }

    entries.push(entry);
  }

  if (entries.length === 0) {
    throw new Error("No valid BibTeX entries found in file.");
  }

  return entries;
}

/**
 * Converts a .bib file to a clean JSON file.
 *
 * @param {string} inputPath - absolute path to the source .bib file
 * @param {string} outputPath - absolute path where the JSON should be written
 * @returns {Promise<void>}
 */
async function convertBibtexToJson(inputPath, outputPath) {
  try {
    const raw = await fs.readFile(inputPath, "utf8");
    const entries = parseBibtex(raw);
    await fs.writeFile(outputPath, JSON.stringify(entries, null, 2), "utf8");
  } catch (err) {
    throw new Error(`BibTeX conversion failed: ${err.message}`);
  }
}

module.exports = { parseBibtex, convertBibtexToJson };
