# AI Dev Office

Software that runs LLM agents as departments of a software-development office
(Research → Product → Architecture → Dev → QA → DevOps). Each department can use a
different LLM provider. The main selling point is **efficiency**: lowest cost and time per task,
made visible through metrics.

## Core design rules
- Departments hand off **documents (artifacts), not conversations**.
- Artifacts **reference each other by ID**, never embed each other. The orchestrator
  looks up the IDs and builds each agent's prompt with only the pieces it needs.
- Every LLM call records provider, model, tokens, cost and duration.
- QA must use a **different provider** than Dev (different blind spots).
- Budget cap per task (e.g. stop at $1) to prevent endless Dev ↔ QA loops.
- Human approval gates: idea selection, spec sign-off, production deploy.
- Artifact contracts live in `docs/office-contracts.ts`.

## Roadmap
- Phase 0 (done, `v0.1.0`): plain TypeScript script, no UI/DB. Spec → Dev agent writes code →
  QA agent checks against acceptance criteria → loop max 3 times → print total cost.
- Phase 1 (done, `v0.2.0`): Fastify + Prisma + Postgres, orchestrator as a state machine, BullMQ jobs.
- **Phase 2 (next):** real GitHub repo (branches, PRs), tests run in Docker, GitHub Actions deploy to staging.
- Phase 3: Angular UI (office floor, task board, approvals, cost dashboard), user picks model per department.
- Phase 4: Research + Architecture departments, smart model routing per task.

## Phase 0 status — complete
- Step 1: `src/config.ts` (hardcoded models + prices), `src/llm.ts` (`callLlm` wraps
  Anthropic/OpenAI/Google/Mistral behind one interface, returns text/tokens/cost/duration).
- Step 2: `docs/office-contracts.ts` (Spec/Code/Review artifact types), `src/store.ts`
  (in-memory artifact store keyed by ID), `src/agents/dev.ts` + `src/agents/qa.ts`
  (pure prompt builders — the orchestrator resolves artifact IDs and passes them in).
- Step 3: `src/orchestrator.ts` runs Spec → build → review, looping build ↔ review
  on FAIL until PASS, `BUDGET_CAP_USD`, or `MAX_REVIEW_LOOPS` is hit. `src/main.ts`
  seeds a sample spec and prints total cost. Verified working end-to-end.
- Decision: model selection stays hardcoded in `config.ts` until Phase 3. Keep it simple.

## Phase 1 status — complete
- `prisma/schema.prisma` + `src/store.ts`: artifacts, `Task` state and every `LlmCall` in Postgres.
  Store maps Prisma rows back to the contract types; `get*` throws `NotFoundError`.
- `src/orchestrator.ts`: state machine. `advanceTask(taskId)` runs exactly one step
  (BUILDING → REVIEWING → PASSED | BUILDING | FAILED_MAX_LOOPS | FAILED_BUDGET).
  Budget is checked before every LLM call.
- `src/queue.ts` + `src/worker.ts`: BullMQ lives only here. A job is just `{ taskId }`;
  the worker calls `advanceTask` and enqueues the next step until the task is final.
- `src/server.ts` + `src/routes/tasks.ts`: `POST /tasks`, `GET /tasks/:id`, `GET /tasks/:id/code`.
  Routes stay thin. `src/main.ts` is a demo client for the API.
- How it all fits: `docs/HOW-IT-WORKS.md`.

## Conventions
- pnpm, TypeScript, ESM (`"type": "module"`)
- Run: `docker compose up -d`, then `pnpm worker` + `pnpm api`; `pnpm start` submits a demo task
- Style: `async` arrow functions with `return` by default
- Works behind a corporate proxy; connection errors may be proxy-related

## How to work with me
- Keep explanations short. Go step by step, code first, explain the *why* briefly.
- Angular comparisons help.
