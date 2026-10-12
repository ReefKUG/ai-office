import { prisma } from "./db.js";
import type { Code, Review, Spec, Task as TaskRow } from "../generated/prisma/client.js";
import type { LlmResult } from "./llm.js";
import type { CodeArtifact, ReviewArtifact, SpecArtifact, Task } from "../docs/office-contracts.js";

// Postgres-backed artifact store. Each artifact type has its own table; the DB generates IDs.
// Rows are mapped back to the contract types so the rest of the app never sees Prisma types.

// Thrown by get* when an ID doesn't exist — the API maps it to a 404.
export class NotFoundError extends Error {}

const toSpec = (row: Spec): SpecArtifact => ({
  id: row.id,
  type: "spec",
  title: row.title,
  description: row.description,
  acceptanceCriteria: row.acceptanceCriteria,
});

const toCode = (row: Code): CodeArtifact => ({
  id: row.id,
  type: "code",
  specId: row.specId,
  revision: row.revision,
  previousReviewId: row.previousReviewId ?? undefined,
  code: row.code,
});

const toReview = (row: Review): ReviewArtifact => ({
  id: row.id,
  type: "review",
  specId: row.specId,
  codeId: row.codeId,
  passed: row.passed,
  feedback: row.feedback,
});

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  specId: row.specId,
  status: row.status,
  loop: row.loop,
  totalCostUsd: row.totalCostUsd.toNumber(),
  lastCodeId: row.lastCodeId ?? undefined,
  lastReviewId: row.lastReviewId ?? undefined,
});

export const saveSpec = async ({ type, ...data }: Omit<SpecArtifact, "id">): Promise<SpecArtifact> => {
  return toSpec(await prisma.spec.create({ data }));
};

export const getSpec = async (id: string): Promise<SpecArtifact> => {
  const row = await prisma.spec.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`No spec found for id "${id}"`);
  return toSpec(row);
};

export const saveCode = async ({ type, ...data }: Omit<CodeArtifact, "id">): Promise<CodeArtifact> => {
  return toCode(await prisma.code.create({ data }));
};

export const getCode = async (id: string): Promise<CodeArtifact> => {
  const row = await prisma.code.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`No code found for id "${id}"`);
  return toCode(row);
};

export const saveReview = async ({ type, ...data }: Omit<ReviewArtifact, "id">): Promise<ReviewArtifact> => {
  return toReview(await prisma.review.create({ data }));
};

export const getReview = async (id: string): Promise<ReviewArtifact> => {
  const row = await prisma.review.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`No review found for id "${id}"`);
  return toReview(row);
};

// Records one LLM call's metrics, linked to the artifact it produced (Dev → code, QA → review).
export const saveLlmCall = async (
  { text, ...metrics }: LlmResult,
  link: { codeId: string } | { reviewId: string },
): Promise<void> => {
  await prisma.llmCall.create({ data: { ...metrics, ...link } });
};

// Task state. A new task starts at BUILDING with loop 0 and $0 spent (DB defaults).
export const createTask = async (specId: string): Promise<Task> => {
  return toTask(await prisma.task.create({ data: { specId } }));
};

export const getTask = async (id: string): Promise<Task> => {
  const row = await prisma.task.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`No task found for id "${id}"`);
  return toTask(row);
};

export const updateTask = async (
  id: string,
  data: Partial<Omit<Task, "id" | "specId">>,
): Promise<Task> => {
  return toTask(await prisma.task.update({ where: { id }, data }));
};
