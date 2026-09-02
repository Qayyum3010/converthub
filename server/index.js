require("dotenv").config();
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const { validatePair } = require("./conversions/registry");
const { convertWithPandoc } = require("./conversions/pandocHandler");
const { toPandocFormat } = require("./conversions/pandocFormats");
const { convertWithLibreOffice } = require("./conversions/libreofficeHandler");
const { convertData } = require("./conversions/dataHandler");
const { convertBibtexToJson } = require("./conversions/bibtexHandler");
const { convertArchive } = require("./conversions/archiveHandler");
const { convertNotebook } = require("./conversions/nbconvertHandler");
const { convertLatex } = require("./conversions/latexHandler");
const {
  validatePdf,
  mergePdfs,
  splitPdf,
  compressPdf,
  analyzePdf,
  comparePdfs,
} = require("./conversions/pdfHandler");
const { runJob } = require("./jobRunner");

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB — matches v1 file size limit

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".html",
  ".htm",
  ".xhtml",
  ".md",
  ".markdown",
  ".adoc",
  ".rst",
  ".xls",
  ".xlsx",
  ".csv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ppt",
  ".pptx",
  ".odp",
  ".tex",
  ".bib",
  ".ipynb",
  ".zip",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
]);

async function main() {
  const fastify = require("fastify")({ logger: true });

  await fastify.register(require("@fastify/cors"), {
    origin: process.env.NODE_ENV === "production" ? false : true,
  });

  await fastify.register(require("@fastify/multipart"), {
    limits: { fileSize: MAX_FILE_SIZE },
  });

  await fastify.register(require("@fastify/rate-limit"), {
    max: 20,
    timeWindow: "1 minute",
    errorResponseBuilder: (request, context) => {
      const retryAfterSeconds = Math.ceil(context.ttl / 1000);
      return {
        statusCode: 429,
        error: "Too Many Requests",
        message: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
      };
    },
  });

  fastify.get("/health", async (request, reply) => {
    return { status: "ok", service: "converthub-server" };
  });

  fastify.post("/upload", async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: "No file provided" });
    }

    const ext = path.extname(data.filename).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      data.file.resume();
      return reply
        .code(400)
        .send({ error: `Unsupported file type: ${ext || "unknown"}` });
    }

    const tempDir = path.join(os.tmpdir(), "converthub-uploads");
    fs.mkdirSync(tempDir, { recursive: true });

    const safeId = crypto.randomUUID();
    const destPath = path.join(tempDir, `${safeId}${ext}`);

    try {
      await pipeline(data.file, fs.createWriteStream(destPath));
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: "Upload failed" });
    }

    if (data.file.truncated) {
      fs.unlink(destPath, () => {});
      return reply.code(413).send({ error: "File exceeds 20MB limit" });
    }

    return {
      fileId: safeId,
      originalName: data.filename,
      extension: ext,
      storedPath: destPath,
    };
  });

  fastify.post("/convert", async (request, reply) => {
    const { fileId, sourceExt, targetExt } = request.body || {};

    if (!fileId || !sourceExt || !targetExt) {
      return reply
        .code(400)
        .send({ error: "fileId, sourceExt, and targetExt are required" });
    }

    const validation = validatePair(sourceExt, targetExt);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.reason });
    }

    const { engine, tier } = validation.conversion;

    const SUPPORTED_ENGINES = new Set([
      "pandoc",
      "libreoffice",
      "data",
      "bibtex",
      "archive",
      "nbconvert",
      "latex",
    ]);
    if (!SUPPORTED_ENGINES.has(engine)) {
      return reply
        .code(501)
        .send({ error: `Engine "${engine}" is not yet implemented.` });
    }

    const tempDir = path.join(os.tmpdir(), "converthub-uploads");
    const inputPath = path.join(
      tempDir,
      `${fileId}.${sourceExt.replace(/^\./, "")}`,
    );
    const outputPath = path.join(
      tempDir,
      `${fileId}-out.${targetExt.replace(/^\./, "")}`,
    );

    if (!fs.existsSync(inputPath)) {
      return reply
        .code(404)
        .send({ error: "Uploaded file not found or expired" });
    }

    try {
      await runJob(async () => {
        if (engine === "pandoc") {
          const fromFormat = toPandocFormat(sourceExt);
          const toFormat = toPandocFormat(targetExt);
          // bibtex needs --citeproc to actually render entries as visible
          // output — without it, Pandoc parses .bib into meta.references
          // but produces empty body content (see DECISIONS.md).
          const extraArgs = fromFormat === "bibtex" ? ["--citeproc"] : [];
          await convertWithPandoc(
            inputPath,
            outputPath,
            fromFormat,
            toFormat,
            extraArgs,
          );
        } else if (engine === "libreoffice") {
          const targetFormat = targetExt.replace(/^\./, "").toLowerCase();
          await convertWithLibreOffice(inputPath, outputPath, targetFormat);
        } else if (engine === "data") {
          await convertData(inputPath, outputPath, sourceExt, targetExt);
        } else if (engine === "bibtex") {
          await convertBibtexToJson(inputPath, outputPath);
        } else if (engine === "archive") {
          const targetFormat = targetExt.replace(/^\./, "").toLowerCase();
          await convertArchive(inputPath, outputPath, targetFormat);
        } else if (engine === "nbconvert") {
          const targetFormat = targetExt.replace(/^\./, "").toLowerCase();
          await convertNotebook(inputPath, outputPath, targetFormat);
        } else if (engine === "latex") {
          const targetFormat = targetExt.replace(/^\./, "").toLowerCase();
          await convertLatex(inputPath, outputPath, targetFormat);
        }
      }, tier);
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }

    return {
      fileId,
      outputPath,
      targetExt,
    };
  });

  // ---- PDF Tools (Task 6) ----
  // Direct operations, not registry.js format-pair conversions — separate
  // routes rather than /convert.

  const tempDir = path.join(os.tmpdir(), "converthub-uploads");

  function resolveUploadPath(fileId, ext) {
    return path.join(tempDir, `${fileId}.${ext.replace(/^\./, "")}`);
  }

  fastify.post("/pdf/merge", async (request, reply) => {
    const { fileIds } = request.body || {};
    if (!Array.isArray(fileIds) || fileIds.length < 2) {
      return reply.code(400).send({
        error:
          "fileIds must be an array of at least 2 file IDs, in merge order",
      });
    }

    const inputPaths = fileIds.map((id) => resolveUploadPath(id, "pdf"));
    for (const p of inputPaths) {
      if (!fs.existsSync(p)) {
        return reply
          .code(404)
          .send({ error: `Uploaded file not found or expired: ${p}` });
      }
    }

    const outputId = crypto.randomUUID();
    const outputPath = path.join(tempDir, `${outputId}-merged.pdf`);

    try {
      for (const p of inputPaths) {
        await validatePdf(p);
      }
      await runJob(() => mergePdfs(inputPaths, outputPath), "medium");
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }

    return { fileId: outputId, outputPath };
  });

  fastify.post("/pdf/split", async (request, reply) => {
    const { fileId, pageRange } = request.body || {};
    if (!fileId || !pageRange) {
      return reply
        .code(400)
        .send({ error: "fileId and pageRange are required" });
    }

    const inputPath = resolveUploadPath(fileId, "pdf");
    if (!fs.existsSync(inputPath)) {
      return reply
        .code(404)
        .send({ error: "Uploaded file not found or expired" });
    }

    const outputId = crypto.randomUUID();
    const outputPath = path.join(tempDir, `${outputId}-split.pdf`);

    try {
      await validatePdf(inputPath);
      await runJob(() => splitPdf(inputPath, outputPath, pageRange), "medium");
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }

    return { fileId: outputId, outputPath };
  });

  fastify.post("/pdf/compress", async (request, reply) => {
    const { fileId } = request.body || {};
    if (!fileId) {
      return reply.code(400).send({ error: "fileId is required" });
    }

    const inputPath = resolveUploadPath(fileId, "pdf");
    if (!fs.existsSync(inputPath)) {
      return reply
        .code(404)
        .send({ error: "Uploaded file not found or expired" });
    }

    const outputId = crypto.randomUUID();
    const outputPath = path.join(tempDir, `${outputId}-compressed.pdf`);

    try {
      await validatePdf(inputPath);
      await runJob(() => compressPdf(inputPath, outputPath), "medium");
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }

    return { fileId: outputId, outputPath };
  });

  fastify.post("/pdf/analyze", async (request, reply) => {
    const { fileId } = request.body || {};
    if (!fileId) {
      return reply.code(400).send({ error: "fileId is required" });
    }

    const inputPath = resolveUploadPath(fileId, "pdf");
    if (!fs.existsSync(inputPath)) {
      return reply
        .code(404)
        .send({ error: "Uploaded file not found or expired" });
    }

    try {
      await validatePdf(inputPath);
      const report = await runJob(() => analyzePdf(inputPath), "medium");
      return report;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post("/pdf/compare", async (request, reply) => {
    const { fileIdA, fileIdB } = request.body || {};
    if (!fileIdA || !fileIdB) {
      return reply
        .code(400)
        .send({ error: "fileIdA and fileIdB are required" });
    }

    const pathA = resolveUploadPath(fileIdA, "pdf");
    const pathB = resolveUploadPath(fileIdB, "pdf");
    if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
      return reply
        .code(404)
        .send({ error: "One or both uploaded files not found or expired" });
    }

    try {
      await validatePdf(pathA);
      await validatePdf(pathB);
      const result = await runJob(() => comparePdfs(pathA, pathB), "medium");
      return result;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });

  const port = process.env.PORT || 4000;
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`Server running on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
