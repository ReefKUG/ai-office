import { BUDGET_CAP_USD, MAX_REVIEW_LOOPS } from "./config.js";
import { callLlm } from "./llm.js";
import { getSpec, saveCode, saveLlmCall, saveReview } from "./store.js";
import { buildDevPrompt, toCodeArtifact } from "./agents/dev.js";
import { buildQaPrompt, parseQaResponse, toReviewArtifact } from "./agents/qa.js";
import type { CodeArtifact, ReviewArtifact } from "../docs/office-contracts.js";

export interface TaskResult {
  code: CodeArtifact;
  review: ReviewArtifact;
  totalCostUsd: number;
  loops: number;
}

// Spec -> Dev -> QA, looping Dev <-> QA on failure until pass, budget cap, or max loops.
export const runTask = async (specId: string): Promise<TaskResult> => {
  const spec = await getSpec(specId);

  let totalCostUsd = 0;
  let previousReview: ReviewArtifact | undefined;
  let code: CodeArtifact | undefined;
  let review: ReviewArtifact | undefined;

  for (let loop = 1; loop <= MAX_REVIEW_LOOPS; loop++) {
    if (totalCostUsd >= BUDGET_CAP_USD) {
      console.log(`Budget cap of $${BUDGET_CAP_USD.toFixed(2)} reached — stopping.`);
      break;
    }

    const devResult = await callLlm("build", buildDevPrompt(spec, previousReview));
    totalCostUsd += devResult.costUsd;
    code = await saveCode(toCodeArtifact(spec.id, loop, devResult.text, previousReview?.id));
    await saveLlmCall(devResult, { codeId: code.id });
    console.log(
      `[build] revision ${loop} — ${devResult.provider}/${devResult.model}, $${devResult.costUsd.toFixed(4)}`,
    );

    const qaResult = await callLlm("review", buildQaPrompt(spec, code));
    totalCostUsd += qaResult.costUsd;
    const { passed, feedback } = parseQaResponse(qaResult.text);
    review = await saveReview(toReviewArtifact(spec.id, code.id, passed, feedback));
    await saveLlmCall(qaResult, { reviewId: review.id });
    console.log(
      `[review] revision ${loop} — ${qaResult.provider}/${qaResult.model}, $${qaResult.costUsd.toFixed(4)} — ${passed ? "PASS" : "FAIL"}`,
    );

    if (passed) break;
    previousReview = review;
  }

  if (!code || !review) throw new Error("Task produced no code/review — MAX_REVIEW_LOOPS is 0?");

  return { code, review, totalCostUsd, loops: code.revision };
};
