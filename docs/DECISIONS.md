# Design decisions

A log of the non-obvious choices behind AI Dev Office and why they were made.

## LLM provider per department

Each department is pinned in `src/config.ts` to a provider/model chosen for its
task shape. Model selection stays hardcoded until Phase 3, when the user will
pick a model per department from the UI.

| Department | Provider | Model | Why |
|---|---|---|---|
| Research | Google | `gemini-3.6-flash` | Broad synthesis / long-context lookup; flash tier keeps research cost near zero. |
| Product | OpenAI | `gpt-4o` | Strong at user-facing writing and framing specs from ambiguous requirements. |
| Architecture | Anthropic | `claude-opus-5` | Strongest reasoning for system-design trade-offs; decisions are high-stakes and low-frequency, so the extra cost is worth it. |
| Build | Anthropic | `claude-sonnet-5` | Best cost/quality ratio for code generation — the highest-volume department. |
| Review | OpenAI | `gpt-4o` | Deliberately a different provider than Build, so it doesn't share Build's blind spots. |
| Delivery | Mistral | `mistral-small-latest` | Infra/delivery work is more templated and lower-stakes; a cheaper model is enough. |

Prices live in `PRICES` in `src/config.ts`. Anthropic prices are confirmed;
OpenAI/Google/Mistral entries are best-effort placeholders to verify before
they drive real budget decisions.

## Artifacts reference each other by ID

`SpecArtifact`, `CodeArtifact` and `ReviewArtifact` (`docs/office-contracts.ts`)
link to each other via `specId`, `codeId` and `previousReviewId` instead of
embedding each other. This keeps one source of truth per document and makes
history traceable ("every review ever done against spec X"). The orchestrator
resolves IDs and pastes only the needed text into each prompt — models never
see IDs.

## Agents are pure prompt builders

`src/agents/dev.ts` and `src/agents/qa.ts` do no I/O and never touch the
store. They turn artifacts into prompt text and parse replies back. All
coordination lives in `src/orchestrator.ts`, so agents are trivially testable
and the orchestration strategy can change (Phase 1: BullMQ jobs) without
touching them.

## Budget cap and loop cap

The Build ↔ Review loop stops on PASS, when total spend crosses
`BUDGET_CAP_USD` ($1), or after `MAX_REVIEW_LOOPS` (3). This prevents an
endless (and expensive) disagreement between two models.

## Domain-neutral department names

Departments are named `build`, `review` and `delivery` rather than `dev`,
`qa` and `devops`, so the office concept can later serve non-software work too.

## Local infrastructure via Docker Compose (Phase 1)

`docker-compose.yml` runs `postgres:16` (persisted to a named volume — it is the
source of truth) and `redis:7` (no persistence — it only backs the BullMQ job
queue, so losing it loses at most queued jobs, never task state).

## Database schema (Phase 1)

- `prisma/schema.prisma` mirrors the artifact contracts. "Reference by ID,
  never embed" is enforced by **foreign keys**.
- `LlmCall` links to the Code *or* Review it produced through **two optional
  foreign keys** rather than one generic `artifactId`, because a foreign key
  can only point at one table.
- Costs are `Decimal(12,6)`, so totals are exact (no float rounding).
- Deleting a Code/Review keeps its `LlmCall` rows (`SET NULL`), so cost
  history survives.
- Prisma and `@prisma/client` are pinned to exactly `7.10.0`: npm's `latest`
  tag pointed at an 8.0 RC that mismatched the client.
- `store.ts` maps Prisma rows back to the contract types, so nothing outside
  the store sees Prisma types.

## Orchestrator as a state machine (Phase 1)

The Phase 0 `runTask` loop kept its progress in local variables. It is now a
`Task` row (`status`, `loop`, `totalCostUsd`, `lastCodeId`, `lastReviewId`)
and `advanceTask(taskId)` runs **exactly one step** (one LLM call, one status
change). All state lives in Postgres, so any process can run the next step
and a crash loses at most the step that was running.

The budget cap is checked **before every LLM call**, not once per loop. It
can still be exceeded by at most one call's cost, since a call's cost is only
known after it returns.

## One job type, carrying only the task ID (Phase 1)

BullMQ has a single job type, `advance`, with data `{ taskId }`. The worker
doesn't know about departments: it calls `advanceTask`, which reads the
status and picks Build or Review. Separate build/review queues were
considered and deferred — they help with per-provider rate limits and
scaling, but add moving parts with no benefit yet.

BullMQ is isolated to `src/queue.ts` and `src/worker.ts`; the orchestrator
doesn't know who calls it. Jobs retry 3 times with exponential backoff
(proxy errors, provider timeouts); after the last failure the task simply
stays at its last status.

## Thin API (Phase 1)

Fastify routes only validate input (JSON schema → `400`) and call existing
store/orchestrator/queue functions. `POST /tasks` replies immediately; the
worker does the slow work. `store.ts` throws `NotFoundError` for unknown IDs,
which one error handler maps to `404`; unexpected errors return a plain `500`
with details only in the server log.

## Operational notes

Provider quirks hit while wiring up all four SDKs:

- **Google:** `gemini-2.5-pro` and `gemini-2.0-flash` were deprecated
  server-side; settled on `gemini-3.6-flash`.
- **Mistral:** `mistral-large-latest` isn't available on every tier. A
  persistent `429` with `x-ratelimit-limit-req-minute: 0` is caused by the
  "Enable Pay-As-You-Go" toggle in Mistral Studio being off.
- **Prisma 7** doesn't read `.env` itself; `prisma.config.ts` loads it with
  Node's built-in `process.loadEnvFile()` instead of adding `dotenv`.

## Measured results

| Run | Result | Total cost |
|---|---|---|
| Hello test across all 6 departments | All responded | $0.0031 |
| FizzBuzz spec, Build (Anthropic) → Review (OpenAI) | PASS on first loop | $0.0035 |
| Same spec via API → BullMQ worker (Phase 1) | PASS on first loop | $0.0034–$0.0040 |
