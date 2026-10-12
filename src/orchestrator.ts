import { BUDGET_CAP_USD, MAX_REVIEW_LOOPS } from "./config.js";
import { callLlm } from "./llm.js";
import {
  createTask,
  getCode,
  getReview,
  getSpec,
  getTask,
  saveCode,
  saveLlmCall,
  saveReview,
  updateTask,
} from "./store.js";
import { buildDevPrompt, toCodeArtifact } from "./agents/dev.js";
import { buildQaPrompt, parseQaResponse, toReviewArtifact } from "./agents/qa.js";
import type { Task, TaskStatus } from "../docs/office-contracts.js";

// State machine for Spec -> Build <-> Review. All state lives in the Task row, so each
// step is independent and resumable (later: one BullMQ job per step).
//
//   BUILDING ──> REVIEWING ──> PASSED
//      ^             │
//      └── FAIL ─────┤──> FAILED_MAX_LOOPS (loop limit hit)
//                    └──> FAILED_BUDGET    (checked before every LLM call)

const FINAL_STATUSES: TaskStatus[] = ["PASSED", "FAILED_MAX_LOOPS", "FAILED_BUDGET"];

export const isFinal = (task: Task): boolean => {
  return FINAL_STATUSES.includes(task.status);
};

export const startTask = async (specId: string): Promise<Task> => {
  return createTask(specId);
};

// Dev writes code for the spec, answering the last review if there is one.
const build = async (task: Task): Promise<Task> => {
  const spec = await getSpec(task.specId);
  const previousReview = task.lastReviewId ? await getReview(task.lastReviewId) : undefined;
  const loop = task.loop + 1;

  const result = await callLlm("build", buildDevPrompt(spec, previousReview));
  const code = await saveCode(toCodeArtifact(spec.id, loop, result.text, previousReview?.id));
  await saveLlmCall(result, { codeId: code.id });
  console.log(`[build] revision ${loop} — ${result.provider}/${result.model}, $${result.costUsd.toFixed(4)}`);

  return updateTask(task.id, {
    status: "REVIEWING",
    loop,
    lastCodeId: code.id,
    totalCostUsd: task.totalCostUsd + result.costUsd,
  });
};

// QA checks the latest code against the spec's acceptance criteria.
const review = async (task: Task): Promise<Task> => {
  if (!task.lastCodeId) throw new Error(`Task "${task.id}" is REVIEWING but has no code`);
  const spec = await getSpec(task.specId);
  const code = await getCode(task.lastCodeId);

  const result = await callLlm("review", buildQaPrompt(spec, code));
  const { passed, feedback } = parseQaResponse(result.text);
  const saved = await saveReview(toReviewArtifact(spec.id, code.id, passed, feedback));
  await saveLlmCall(result, { reviewId: saved.id });
  console.log(
    `[review] revision ${task.loop} — ${result.provider}/${result.model}, $${result.costUsd.toFixed(4)} — ${passed ? "PASS" : "FAIL"}`,
  );

  const status: TaskStatus = passed ? "PASSED" : task.loop >= MAX_REVIEW_LOOPS ? "FAILED_MAX_LOOPS" : "BUILDING";
  return updateTask(task.id, {
    status,
    lastReviewId: saved.id,
    totalCostUsd: task.totalCostUsd + result.costUsd,
  });
};

// Runs exactly one step and returns the task's new state. Final tasks are returned unchanged.
export const advanceTask = async (taskId: string): Promise<Task> => {
  const task = await getTask(taskId);
  if (isFinal(task)) return task;

  if (task.totalCostUsd >= BUDGET_CAP_USD) {
    console.log(`Budget cap of $${BUDGET_CAP_USD.toFixed(2)} reached — stopping.`);
    return updateTask(task.id, { status: "FAILED_BUDGET" });
  }

  return task.status === "BUILDING" ? build(task) : review(task);
};
