import { Queue } from "bullmq";
import { Redis } from "ioredis";

// BullMQ lives only here and in worker.ts. The rest of the app just calls enqueueAdvance().
// A job carries only the task ID — all task state stays in Postgres.

export const QUEUE_NAME = "tasks";

export interface AdvanceJob {
  taskId: string;
}

// maxRetriesPerRequest: null is required by BullMQ for its blocking Redis commands.
export const connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// ioredis reconnects on its own; log one short line instead of a full stack trace per attempt.
connection.on("error", (err) => {
  console.error(`[redis] not reachable (${err.message || "connection refused"}) — retrying…`);
});

const queue = new Queue<AdvanceJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3, // retry proxy errors / provider timeouts
    backoff: { type: "exponential", delay: 2000 }, // 2s, 4s
    removeOnComplete: true,
    removeOnFail: 100, // keep the last 100 failed jobs for inspection
  },
});

// Asks a worker to run the next step of this task.
export const enqueueAdvance = async (taskId: string): Promise<void> => {
  await queue.add("advance", { taskId });
};

export const closeQueue = async (): Promise<void> => {
  await queue.close();
  await connection.quit();
};
