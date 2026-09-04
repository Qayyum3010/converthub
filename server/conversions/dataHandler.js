// dataHandler.js
// Pure-JS conversions between structured data formats: CSV, JSON, YAML,
// TOML, XML. No external binaries — all handled via npm packages, so
// these stay on the "fast" timeout tier (see jobRunner.js).

const fs = require("fs/promises");
const Papa = require("papaparse");
const yaml = require("js-yaml");
const TOML = require("@iarna/toml");
const { Builder: XmlBuilder, parseStringPromise } = require("xml2js");

/**
 * Converts a file between structured data formats.
 *
 * @param {string} inputPath - absolute path to the source file
 * @param {string} outputPath - absolute path where the converted file should be written
 * @param {string} fromExt - source extension, no dot (e.g. "csv")
 * @param {string} toExt - target extension, no dot (e.g. "json")
 * @returns {Promise<void>}
 */
async function convertData(inputPath, outputPath, fromExt, toExt) {
  const from = fromExt.replace(/^\./, "").toLowerCase();
  const to = toExt.replace(/^\./, "").toLowerCase();

  try {
    const raw = await fs.readFile(inputPath, "utf8");
    const data = await parseInput(raw, from);
    // `from` is threaded through so serializeOutput's csv case can
    // specifically unwrap XML's root-tag wrapper (see fix note below) —
    // every other target format keeps that wrapper as-is, unchanged.
    const output = await serializeOutput(data, to, from);
    await fs.writeFile(outputPath, output, "utf8");
  } catch (err) {
    throw new Error(
      `Data conversion failed (${from} -> ${to}): ${err.message}`,
    );
  }
}

async function parseInput(raw, from) {
  switch (from) {
    case "csv": {
      const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
      if (result.errors.length > 0) {
        throw new Error(`CSV parse error: ${result.errors[0].message}`);
      }
      return result.data;
    }
    case "json":
      return JSON.parse(raw);
    case "yaml":
    case "yml":
      return yaml.load(raw);
    case "toml":
      return TOML.parse(raw);
    case "xml": {
      const parsed = await parseStringPromise(raw, { explicitArray: false });
      return parsed;
    }
    default:
      throw new Error(`Unsupported source data format: ${from}`);
  }
}

async function serializeOutput(data, to, from) {
  switch (to) {
    case "csv": {
      // XML always parses into { <rootTag>: <content> } (see parseInput's
      // xml case) — correct/by-design for json/yaml/toml targets (see
      // DECISIONS.md, 2026-09-02), but CSV has no concept of a nested
      // wrapper object: Papa.unparse would stringify it to a single
      // "[object Object]" cell instead of real rows. Unwrap the root tag
      // ONLY for this csv path, before deciding row shape.
      let csvData = data;
      if (
        from === "xml" &&
        csvData &&
        typeof csvData === "object" &&
        !Array.isArray(csvData) &&
        Object.keys(csvData).length === 1
      ) {
        csvData = Object.values(csvData)[0];
      }
      return Papa.unparse(Array.isArray(csvData) ? csvData : [csvData]);
    }
    case "json":
      return JSON.stringify(data, null, 2);
    case "yaml":
    case "yml":
      return yaml.dump(data);
    case "toml": {
      // TOML has no bare top-level array syntax the way JSON/YAML do — a
      // plain array (which is exactly what CSV always parses into: one
      // object per row) can't be represented directly. Wrap it under a
      // `rows` key so @iarna/toml's stringifier renders it as proper
      // TOML array-of-tables ([[rows]] blocks), which is TOML's actual
      // mechanism for "a list of records." Non-array data (e.g. from
      // json/yaml single-object sources) is passed through unchanged.
      // See DECISIONS.md, 2026-09-04.
      const tomlData = Array.isArray(data) ? { rows: data } : data;
      return TOML.stringify(tomlData);
    }
    case "xml": {
      const builder = new XmlBuilder();
      const wrapped = Array.isArray(data)
        ? { root: { item: data } }
        : { root: data };
      return builder.buildObject(wrapped);
    }
    default:
      throw new Error(`Unsupported target data format: ${to}`);
  }
}

module.exports = { convertData };
