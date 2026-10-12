import Fastify from "fastify";
import { prisma } from "./db.js";
import { closeQueue } from "./queue.js";
import { NotFoundError } from "./store.js";
import { taskRoutes } from "./routes/tasks.js";

// HTTP API. Only creates tasks and reads state — the worker (pnpm worker) does the LLM work.
// Run with: pnpm api

const PORT = Number(process.env["PORT"] ?? 3000);

const app = Fastify({ logger: true });

// One place for error responses: 404 for unknown IDs, validation errors as-is,
// and unexpected errors hidden behind a plain 500 (details go to the server log only).
app.setErrorHandler((error, request, reply) => {
  if (error instanceof NotFoundError) {
    return reply.code(404).send({ error: "Not Found", message: error.message });
  }
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode && statusCode < 500) return reply.send(error);

  request.log.error(error);
  return reply.code(500).send({ error: "Internal Server Error", message: "Something went wrong" });
});

app.register(taskRoutes);

// Ctrl+C: stop accepting requests, then close connections.
process.on("SIGINT", async () => {
  await app.close();
  await closeQueue();
  await prisma.$disconnect();
  process.exit(0);
});

await app.listen({ port: PORT });
