// bibtexHandler.js
// Small custom BibTeX -> JSON parser. Deliberately hand-rolled rather than
// pulling in a dependency — see DECISIONS.md for the reasoning (the two
// candidate npm packages were either stale or a massive NLP-laden
// over-fit for this narrow, well-bounded parsing problem). No shell-out,
// pure JS — same "fast tier" pattern as dataHandler.js.

const fs = require("fs/promises");
const { Builder: XmlBuilder } = require("xml2js");
const Papa = require("papaparse");

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

/**
 * Converts a .bib file to a clean XML file, reusing the same BibTeX
 * parser as convertBibtexToJson. Wraps entries the same way
 * dataHandler.js's XML target does ({ root: { item: [...] } }) for
 * consistency across the app's XML output.
 *
 * @param {string} inputPath - absolute path to the source .bib file
 * @param {string} outputPath - absolute path where the XML should be written
 * @returns {Promise<void>}
 */
async function convertBibtexToXml(inputPath, outputPath) {
  try {
    const raw = await fs.readFile(inputPath, "utf8");
    const entries = parseBibtex(raw);
    const builder = new XmlBuilder();
    const xml = builder.buildObject({ root: { item: entries } });
    await fs.writeFile(outputPath, xml, "utf8");
  } catch (err) {
    throw new Error(`BibTeX-to-XML conversion failed: ${err.message}`);
  }
}

/**
 * Converts a .bib file to a CSV file, reusing the same BibTeX parser as
 * convertBibtexToJson/convertBibtexToXml (Task 5.10.7).
 *
 * BibTeX entries have variable fields by design (an @article typically
 * has journal/volume, while an @book has publisher/isbn, etc.) — a naive
 * CSV write would either crash on mismatched columns or silently drop
 * fields. Papa.unparse() (already a project dependency, used the same
 * way in dataHandler.js) handles this correctly out of the box: given
 * an array of objects, it automatically computes the union of all keys
 * across every entry as the header row, and fills in an empty cell for
 * any entry missing a given field — exactly the behavior needed here,
 * with no extra logic required.
 *
 * @param {string} inputPath - absolute path to the source .bib file
 * @param {string} outputPath - absolute path where the CSV should be written
 * @returns {Promise<void>}
 */
async function convertBibtexToCsv(inputPath, outputPath) {
  try {
    const raw = await fs.readFile(inputPath, "utf8");
    const entries = parseBibtex(raw);

    // Papa.unparse() only infers headers from the FIRST object's keys when
    // given a plain array of objects — it does NOT compute the true union
    // of keys across every row. BibTeX entries have variable fields by
    // design (an @article has `journal`, a @book has `publisher` instead),
    // so relying on the first entry silently drops any field that first
    // entry doesn't happen to have. Compute the real union ourselves and
    // pass it explicitly via the {fields, data} form.
    const fieldSet = new Set();
    for (const entry of entries) {
      for (const key of Object.keys(entry)) {
        fieldSet.add(key);
      }
    }
    const fields = Array.from(fieldSet);

    const csv = Papa.unparse({ fields, data: entries });
    await fs.writeFile(outputPath, csv, "utf8");
  } catch (err) {
    throw new Error(`BibTeX-to-CSV conversion failed: ${err.message}`);
  }
}

module.exports = {
  parseBibtex,
  convertBibtexToJson,
  convertBibtexToXml,
  convertBibtexToCsv,
};
