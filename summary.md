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

## 2026-09-15 — Session summary

- Completed Phase 0 Step 2 and Step 3, finishing Phase 0.
- Added `docs/office-contracts.ts`: the three artifact ("ticket") types —
  `SpecArtifact`, `CodeArtifact`, `ReviewArtifact` — each referencing the
  others by ID only (`specId`, `codeId`, `previousReviewId`), never by
  embedding the full document.
- Added `src/store.ts`: an in-memory `Map<string, Artifact>` (`saveArtifact` /
  `getArtifact`) standing in for a real database until Phase 1.
- Added `src/agents/dev.ts` and `src/agents/qa.ts`: pure prompt-builder
  functions for the Build and Review departments. `buildDevPrompt` takes the
  spec and, on a retry, the previous review's feedback. `buildQaPrompt` takes
  the spec + code; `parseQaResponse` reads the PASS/FAIL verdict back out.
  Neither file does any I/O or touches the store — the orchestrator resolves
  IDs and hands them only the content they need.
- Added `src/orchestrator.ts` (`runTask`): Spec → Build → Review, looping
  Build ↔ Review on FAIL until PASS, `BUDGET_CAP_USD` ($1), or
  `MAX_REVIEW_LOOPS` (3) is hit.
- Rewrote `src/main.ts` to seed one real sample spec (FizzBuzz) and run it
  through `runTask`, printing final PASS/FAIL and total cost, replacing the
  old hello-test loop.
- Fixed a `tsconfig.json` build error: `rootDir` was `src`, but
  `office-contracts.ts` lives in `docs/` — widened `rootDir` to `.` and added
  `docs` to `include`.
- Added `docs/HOW-IT-WORKS.md`: a plain-language walkthrough of the whole
  flow, for onboarding/reference — departments never talk to each other
  directly, only the orchestrator resolves tickets and calls each one in turn.
- Verified end-to-end with a real run: Build (Anthropic) wrote FizzBuzz,
  Review (OpenAI) passed it first try. Total cost: **$0.0035**.
- Committed as `4d54b9c`.

Next up: Phase 1 — Fastify + Prisma + Postgres, orchestrator as a state
machine, BullMQ jobs. Not started yet by user request.

## 2026-09-22 — Session summary

- Started Phase 1. User installed Docker Desktop.
- Added `docker-compose.yml`: two services, `postgres:16` (user/password/db
  all `office`, port `5432`, persisted to a named volume `postgres_data` so
  data survives container restarts) and `redis:7` (port `6379`, no
  persistence needed — it's just BullMQ's job queue backend, not a source of
  truth).
- Ran `docker compose up -d` — pulled both images and started both
  containers in the background. Verified both `Up` via `docker compose ps`:
  `ai-office-postgres-1` on `localhost:5432`, `ai-office-redis-1` on
  `localhost:6379`.
- Nothing in the app code talks to either yet — no npm packages installed,
  no Prisma schema, no Fastify server, no BullMQ queue. That's all still
  ahead.
- Paused here by user request (new to backend, wanted a detailed walkthrough
  of Docker concepts — images vs containers, ports, volumes — before going
  further).

Next up: Step 2 of Phase 1 — install `fastify`, `prisma` + `@prisma/client`,
`bullmq`, `ioredis` via pnpm. No schema or app code changes yet, just adding
the packages. After that: write `prisma/schema.prisma` mirroring the
artifact types in `docs/office-contracts.ts` (Spec/Code/Review) and run the
first migration against the Postgres container already running.
