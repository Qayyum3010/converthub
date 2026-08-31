require("dotenv").config();
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");

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

  const port = process.env.PORT || 4000;
    await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`Server running on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
