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
const {
  createJob,
  markProcessing,
  markDone,
  markFailed,
  getJob,
} = require("./jobStore");

const { startCleanupJob } = require("./cleanup");

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
    const { fileId, fileIds, sourceExt, targetExt } = request.body || {};
    const idList = Array.isArray(fileIds) ? fileIds : fileId ? [fileId] : [];

    if (idList.length === 0 || !sourceExt || !targetExt) {
      return reply.code(400).send({
        error:
          "fileId (or fileIds array), sourceExt, and targetExt are required",
      });
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

    const jobFiles = idList.map((id) => ({
      fileId: id,
      inputPath: path.join(tempDir, `${id}.${sourceExt.replace(/^\./, "")}`),
      outputPath: path.join(
        tempDir,
        `${id}-out.${targetExt.replace(/^\./, "")}`,
      ),
    }));

    const missing = jobFiles.filter((f) => !fs.existsSync(f.inputPath));
    if (missing.length > 0) {
      return reply.code(404).send({
        error: `Uploaded file(s) not found or expired: ${missing
          .map((f) => f.fileId)
          .join(", ")}`,
      });
    }

    const jobId = createJob();
    const isBatch = idList.length > 1;

    async function convertOne(inputPath, outputPath) {
      if (engine === "pandoc") {
        const fromFormat = toPandocFormat(sourceExt);
        const toFormat = toPandocFormat(targetExt);
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
    }

    // Fire-and-forget: do NOT await this. The HTTP response returns the
    // jobId immediately; conversion(s) run in the background and update
    // the job record via markDone/markFailed, which /job/:jobId reads.
    (async () => {
      markProcessing(jobId);

      if (!isBatch) {
        // Single-file path: keep the original flat result shape so
        // existing callers/tests (and /download/:jobId) are unaffected.
        try {
          await runJob(
            () => convertOne(jobFiles[0].inputPath, jobFiles[0].outputPath),
            tier,
          );
          markDone(jobId, {
            fileId: jobFiles[0].fileId,
            outputPath: jobFiles[0].outputPath,
            targetExt,
          });
        } catch (err) {
          fastify.log.error(err);
          markFailed(jobId, err.message);
        }
        return;
      }

      // Batch path: run each file independently; one failure doesn't
      // fail the others. Aggregate per-file status into job.result.
      const results = [];
      for (const f of jobFiles) {
        try {
          await runJob(() => convertOne(f.inputPath, f.outputPath), tier);
          results.push({
            fileId: f.fileId,
            outputPath: f.outputPath,
            targetExt,
            status: "done",
          });
        } catch (err) {
          fastify.log.error(err);
          results.push({
            fileId: f.fileId,
            status: "failed",
            error: err.message,
          });
        }
      }

      const allSucceeded = results.every((r) => r.status === "done");
      // Batch job is only marked "failed" overall if every file failed;
      // partial success still resolves as "done" so the client can poll
      // once and see per-file status in the result.
      if (results.some((r) => r.status === "done")) {
        markDone(jobId, { files: results, allSucceeded });
      } else {
        markFailed(jobId, "All files in batch failed to convert");
      }
    })();

    return reply.code(202).send({ jobId });
  });

  fastify.get("/job/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const job = getJob(jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return job;
  });

  fastify.get("/download/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const job = getJob(jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    if (job.status !== "done") {
      return reply.code(409).send({
        error: `Job is not ready for download (status: ${job.status})`,
      });
    }

    // Batch result: zip only the successfully-produced files. A batch job
    // with zero successes is never marked "done" (see /convert, /pdf/compress
    // — all-failed batches call markFailed instead), so this array is
    // guaranteed non-empty here.
    if (Array.isArray(job.result.files)) {
      const successFiles = job.result.files.filter(
        (f) => f.status === "done" && fs.existsSync(f.outputPath),
      );

      if (successFiles.length === 0) {
        return reply
          .code(410)
          .send({ error: "All result files have expired or were deleted" });
      }

      const archiver = require("archiver");
      const archive = archiver("zip", { zlib: { level: 9 } });

      reply.header(
        "Content-Disposition",
        `attachment; filename="converthub-batch-${jobId}.zip"`,
      );
      reply.header("Content-Type", "application/zip");

      archive.on("error", (err) => {
        fastify.log.error(err);
        // Headers are likely already sent by the time archiver errors
        // mid-stream; destroy the response rather than trying to send a
        // JSON error at this point.
        reply.raw.destroy(err);
      });

      for (const f of successFiles) {
        const ext = f.targetExt || "pdf";
        archive.file(f.outputPath, { name: `${f.fileId}.${ext}` });
      }

      archive.finalize();
      return reply.send(archive);
    }

    // Single-file result: unchanged from before.
    const { outputPath, fileId, targetExt } = job.result;

    if (!fs.existsSync(outputPath)) {
      return reply
        .code(410)
        .send({ error: "File has expired or was already deleted" });
    }

    const downloadName = `converted-${fileId}.${targetExt}`;
    reply.header(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`,
    );
    return reply.send(fs.createReadStream(outputPath));
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

    const jobId = createJob();

    (async () => {
      markProcessing(jobId);
      try {
        for (const p of inputPaths) {
          await validatePdf(p);
        }
        await runJob(() => mergePdfs(inputPaths, outputPath), "medium");
        markDone(jobId, { fileId: outputId, outputPath, targetExt: "pdf" });
      } catch (err) {
        fastify.log.error(err);
        markFailed(jobId, err.message);
      }
    })();

    return reply.code(202).send({ jobId });
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

    const jobId = createJob();

    (async () => {
      markProcessing(jobId);
      try {
        await validatePdf(inputPath);
        await runJob(
          () => splitPdf(inputPath, outputPath, pageRange),
          "medium",
        );
        markDone(jobId, { fileId: outputId, outputPath, targetExt: "pdf" });
      } catch (err) {
        fastify.log.error(err);
        markFailed(jobId, err.message);
      }
    })();

    return reply.code(202).send({ jobId });
  });

  fastify.post("/pdf/compress", async (request, reply) => {
    const { fileId, fileIds } = request.body || {};
    const idList = Array.isArray(fileIds) ? fileIds : fileId ? [fileId] : [];

    if (idList.length === 0) {
      return reply
        .code(400)
        .send({ error: "fileId (or fileIds array) is required" });
    }

    const jobFiles = idList.map((id) => ({
      fileId: id,
      inputPath: resolveUploadPath(id, "pdf"),
    }));

    const missing = jobFiles.filter((f) => !fs.existsSync(f.inputPath));
    if (missing.length > 0) {
      return reply.code(404).send({
        error: `Uploaded file(s) not found or expired: ${missing
          .map((f) => f.fileId)
          .join(", ")}`,
      });
    }

    const jobId = createJob();
    const isBatch = idList.length > 1;

    async function compressOne(f) {
      const outputId = crypto.randomUUID();
      const outputPath = path.join(tempDir, `${outputId}-compressed.pdf`);
      await validatePdf(f.inputPath);
      await runJob(() => compressPdf(f.inputPath, outputPath), "medium");
      return outputPath;
    }

    (async () => {
      markProcessing(jobId);

      if (!isBatch) {
        try {
          const outputPath = await compressOne(jobFiles[0]);
          markDone(jobId, {
            fileId: jobFiles[0].fileId,
            outputPath,
            targetExt: "pdf",
          });
        } catch (err) {
          fastify.log.error(err);
          markFailed(jobId, err.message);
        }
        return;
      }

      const results = [];
      for (const f of jobFiles) {
        try {
          const outputPath = await compressOne(f);
          results.push({
            fileId: f.fileId,
            outputPath,
            targetExt: "pdf",
            status: "done",
          });
        } catch (err) {
          fastify.log.error(err);
          results.push({
            fileId: f.fileId,
            status: "failed",
            error: err.message,
          });
        }
      }

      const allSucceeded = results.every((r) => r.status === "done");
      if (results.some((r) => r.status === "done")) {
        markDone(jobId, { files: results, allSucceeded });
      } else {
        markFailed(jobId, "All files in batch failed to compress");
      }
    })();

    return reply.code(202).send({ jobId });
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

    const jobId = createJob();

    (async () => {
      markProcessing(jobId);
      try {
        await validatePdf(inputPath);
        const report = await runJob(() => analyzePdf(inputPath), "slow");
        markDone(jobId, report);
      } catch (err) {
        fastify.log.error(err);
        markFailed(jobId, err.message);
      }
    })();

    return reply.code(202).send({ jobId });
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

    const jobId = createJob();

    (async () => {
      markProcessing(jobId);
      try {
        await validatePdf(pathA);
        await validatePdf(pathB);
        const result = await runJob(() => comparePdfs(pathA, pathB), "slow");
        markDone(jobId, result);
      } catch (err) {
        fastify.log.error(err);
        markFailed(jobId, err.message);
      }
    })();

    return reply.code(202).send({ jobId });
  });

  startCleanupJob();

  const port = process.env.PORT || 4000;
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`Server running on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
