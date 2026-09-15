import type { CodeArtifact, ReviewArtifact, SpecArtifact } from "../../docs/office-contracts.js";

// Pure prompt builder — same "resolve by ID, pass only what's needed" rule as dev.ts.
export const buildQaPrompt = (spec: SpecArtifact, code: CodeArtifact): string => {
  const criteria = spec.acceptanceCriteria.map((c) => `- ${c}`).join("\n");

  return [
    `You are the review department, checking the build department's work.`,
    `Title: ${spec.title}`,
    `Description: ${spec.description}`,
    `Acceptance criteria:`,
    criteria,
    ``,
    `Code to review:`,
    "```",
    code.code,
    "```",
    ``,
    `Reply with "PASS" or "FAIL" on the first line.`,
    `On following lines, explain briefly why, citing any unmet acceptance criteria.`,
  ].join("\n");
};

export const parseQaResponse = (text: string): { passed: boolean; feedback: string } => {
  const [firstLine, ...rest] = text.trim().split("\n");
  return {
    passed: firstLine?.trim().toUpperCase().startsWith("PASS") ?? false,
    feedback: rest.join("\n").trim(),
  };
};

export const toReviewArtifact = (
  specId: string,
  codeId: string,
  passed: boolean,
  feedback: string,
): Omit<ReviewArtifact, "id"> => ({
  type: "review",
  specId,
  codeId,
  passed,
  feedback,
});
