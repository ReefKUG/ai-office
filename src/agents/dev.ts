import type { CodeArtifact, ReviewArtifact, SpecArtifact } from "../../docs/office-contracts.js";

// Pure prompt builder — the orchestrator resolves artifact IDs and passes in only
// the objects this prompt needs, per the "reference by ID, never embed" rule.
export const buildDevPrompt = (spec: SpecArtifact, previousReview?: ReviewArtifact): string => {
  const criteria = spec.acceptanceCriteria.map((c) => `- ${c}`).join("\n");

  if (!previousReview) {
    return [
      `You are the build department. Write code that satisfies this spec.`,
      `Title: ${spec.title}`,
      `Description: ${spec.description}`,
      `Acceptance criteria:`,
      criteria,
      ``,
      `Respond with only the code, no explanation.`,
    ].join("\n");
  }

  return [
    `You are the build department. Revise your code to address QA feedback.`,
    `Title: ${spec.title}`,
    `Description: ${spec.description}`,
    `Acceptance criteria:`,
    criteria,
    ``,
    `QA feedback on the previous revision:`,
    previousReview.feedback,
    ``,
    `Respond with only the full revised code, no explanation.`,
  ].join("\n");
};

export const toCodeArtifact = (
  specId: string,
  revision: number,
  code: string,
  previousReviewId?: string,
): Omit<CodeArtifact, "id"> => ({
  type: "code",
  specId,
  revision,
  previousReviewId,
  code,
});
