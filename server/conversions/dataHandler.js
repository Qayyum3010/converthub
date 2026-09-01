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
    const output = await serializeOutput(data, to);
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

async function serializeOutput(data, to) {
  switch (to) {
    case "csv":
      return Papa.unparse(Array.isArray(data) ? data : [data]);
    case "json":
      return JSON.stringify(data, null, 2);
    case "yaml":
    case "yml":
      return yaml.dump(data);
    case "toml":
      return TOML.stringify(data);
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
