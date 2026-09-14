# AI Dev Office — Summary

## LLM providers per department

Each department is hardcoded in `src/config.ts` to a provider/model chosen for
its task shape. Review is deliberately on a different provider than Build so
the two don't share the same blind spots.

| Department | Provider | Model | Why |
|---|---|---|---|
| Research | Google | `gemini-3.6-flash` | Best fit for broad synthesis / long-context lookup work; flash tier keeps cost near zero for research-style prompts. |
| Product | OpenAI | `gpt-4o` | Strong at user-facing writing and framing specs from ambiguous requirements. |
| Architecture | Anthropic | `claude-opus-5` | Strongest available model for system-design tradeoff reasoning; architecture decisions are high-stakes and low-frequency, so the extra cost is worth it. |
| Build | Anthropic | `claude-sonnet-5` | Best cost/quality ratio for code generation; this is the highest-volume department. |
| Review | OpenAI | `gpt-4o` | Different provider than Build on purpose — catches mistakes Build's own provider would be blind to. |
| Delivery | Mistral | `mistral-small-latest` | Delivery/infra tasks are more templated and lower-stakes than Build or Architecture, so a cheaper model is enough. |

Prices for all four providers live in `PRICES` in `src/config.ts`. Anthropic
prices are confirmed; OpenAI/Google/Mistral entries are best-effort
placeholders and should be checked against each provider's pricing page
before they're used to drive real budget decisions.

## 2026-09-14 — Session summary

- Wired up all 4 providers (Anthropic, OpenAI, Google, Mistral) in
  `src/llm.ts` and `src/config.ts`. Previously only Anthropic + OpenAI were
  supported.
- Renamed departments to be domain-neutral, since the office concept is meant
  to eventually serve non-software customers too: `dev` → `build`,
  `qa` → `review`, `devops` → `delivery` (`MAX_QA_LOOPS` →
  `MAX_REVIEW_LOOPS`). `research`, `product`, `architecture` were already
  generic enough to keep.
- Created `.env` (gitignored) with real API keys for all 4 providers and
  added the two new key names to `.env.example`.
- Fixed a real bug in `src/main.ts`: the hello-test prompt never told the
  model which department it was, so responses randomly claimed to be
  "Help Desk", "QA", "IT Support", etc. instead of the correct department.
  Now the department name is interpolated into the prompt.
- Debugged and resolved provider-side issues hit while getting the hello
  test to run end-to-end:
  - Google: `gemini-2.5-pro` and `gemini-2.0-flash` were both deprecated
    server-side; settled on `gemini-3.6-flash`.
  - OpenAI: account had no billing credits (`credit_balance_exhausted`) —
    resolved once credits were added.
  - Mistral: `mistral-large-latest` isn't available on the account's tier;
    switched to `mistral-small-latest`. Also hit a persistent `429` with
    `x-ratelimit-limit-req-minute: 0` even after adding $20 credit — root
    cause was the "Enable Pay-As-You-Go" toggle in Mistral Studio being off;
    turning it on immediately granted a real rate limit (100 req/min).
- Ran the Phase 0 Step 1 hello test successfully across all 6 departments.
  Total cost: **$0.0031**.

Next up: Phase 0 Step 2 — Build and Review agents.
