require("dotenv").config();
const fastify = require("fastify")({ logger: true });

fastify.register(require("@fastify/cors"), {
  origin: process.env.NODE_ENV === "production" ? false : true, // tighten before deploy
});

fastify.register(require("@fastify/multipart"), {
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB, matches our v1 file size limit
  },
});

fastify.get("/health", async (request, reply) => {
  return { status: "ok", service: "converthub-server" };
});

const start = async () => {
  try {
    const port = process.env.PORT || 4000;
    await fastify.listen({ port });
    console.log(`Server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
