import { Worker } from "bullmq";
import { prisma } from "./db.js";
import { advanceTask, isFinal } from "./orchestrator.js";
import { closeQueue, connection, enqueueAdvance, QUEUE_NAME, type AdvanceJob } from "./queue.js";

// Background process: takes "advance" jobs from Redis and runs one task step per job.
// All the decisions (which department, which LLM) happen inside advanceTask.
// Run with: pnpm worker

const worker = new Worker<AdvanceJob>(
  QUEUE_NAME,
  async (job) => {
    const task = await advanceTask(job.data.taskId);
    console.log(`[worker] task ${task.id} → ${task.status} ($${task.totalCostUsd.toFixed(4)} total)`);

    if (isFinal(task)) {
      console.log(`[worker] task ${task.id} finished after ${task.loop} loop(s)`);
      return;
    }
    await enqueueAdvance(task.id);
  },
  { connection, concurrency: 3 },
);

// After the last retry the task just stays at its last status in Postgres.
worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} for task ${job?.data.taskId} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

console.log(`[worker] listening on queue "${QUEUE_NAME}"`);

// Ctrl+C: let running jobs finish, then close connections.
process.on("SIGINT", async () => {
  console.log("[worker] shutting down…");
  await worker.close();
  await closeQueue();
  await prisma.$disconnect();
  process.exit(0);
});
