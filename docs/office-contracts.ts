// Artifact contracts. Departments hand off these documents, never raw conversations.
// Artifacts reference each other by ID (specId, codeId, ...) — never embed each other.
// The orchestrator resolves IDs and builds each agent's prompt with only the pieces it needs.

export interface SpecArtifact {
  id: string;
  type: "spec";
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

export interface CodeArtifact {
  id: string;
  type: "code";
  specId: string;
  revision: number; // 1 on first Dev pass, incremented on each revision
  previousReviewId?: string; // the review this revision was written in response to
  code: string;
}

export interface ReviewArtifact {
  id: string;
  type: "review";
  specId: string;
  codeId: string;
  passed: boolean;
  feedback: string;
}

export type Artifact = SpecArtifact | CodeArtifact | ReviewArtifact;
