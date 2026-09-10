export type Provider = "anthropic" | "openai";

export type Department =
  | "research"
  | "product"
  | "architecture"
  | "dev"
  | "qa"
  | "devops";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

// Hardcoded per department until Phase 3 (user picks model per department).
// QA is deliberately on a different provider than Dev so they don't share blind spots.
export const DEPARTMENTS: Record<Department, ModelConfig> = {
  research: { provider: "anthropic", model: "claude-sonnet-5" },
  product: { provider: "anthropic", model: "claude-sonnet-5" },
  architecture: { provider: "anthropic", model: "claude-opus-5" },
  dev: { provider: "anthropic", model: "claude-sonnet-5" },
  qa: { provider: "openai", model: "gpt-4o" },
  devops: { provider: "anthropic", model: "claude-sonnet-5" },
};

// $ per 1M tokens. Anthropic prices confirmed current as of 2026-06-24.
// OpenAI prices are best-effort placeholders — verify against platform.openai.com/pricing
// before this drives real budget decisions.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

// Stop the Dev <-> QA loop once total spend on a task crosses this.
export const BUDGET_CAP_USD = 1.0;

// Max Dev <-> QA iterations before giving up on a task.
export const MAX_QA_LOOPS = 3;
