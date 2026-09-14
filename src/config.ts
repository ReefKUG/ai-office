export type Provider = "anthropic" | "openai" | "google" | "mistral";

export type Department =
  | "research"
  | "product"
  | "architecture"
  | "build"
  | "review"
  | "delivery";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

// Hardcoded per department until Phase 3 (user picks model per department).
// Provider chosen per department's task shape (research/product/architecture/build/review/delivery).
// Review is deliberately on a different provider than Build so they don't share blind spots.
export const DEPARTMENTS: Record<Department, ModelConfig> = {
  research: { provider: "google", model: "gemini-3.6-flash" },
  product: { provider: "openai", model: "gpt-4o" },
  architecture: { provider: "anthropic", model: "claude-opus-5" },
  build: { provider: "anthropic", model: "claude-sonnet-5" },
  review: { provider: "openai", model: "gpt-4o" },
  delivery: { provider: "mistral", model: "mistral-small-latest" },
};

// $ per 1M tokens. Anthropic prices confirmed current as of 2026-06-24.
// OpenAI/Google/Mistral prices are best-effort placeholders — verify against each
// provider's pricing page before this drives real budget decisions.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-3.6-flash": { input: 0.1, output: 0.4 }, // placeholder — verify pricing; free-tier quota unlike gemini-3.1-pro
  "mistral-small-latest": { input: 0.2, output: 0.6 }, // placeholder — verify pricing; large-latest not on current subscription tier
};

// Stop the Build <-> Review loop once total spend on a task crosses this.
export const BUDGET_CAP_USD = 1.0;

// Max Build <-> Review iterations before giving up on a task.
export const MAX_REVIEW_LOOPS = 3;
