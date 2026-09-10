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
- **Phase 0 (current):** plain TypeScript script, no UI/DB. Spec → Dev agent writes code →
  QA agent checks against acceptance criteria → loop max 3 times → print total cost.
- Phase 1: Fastify + Prisma + Postgres, orchestrator as a state machine, BullMQ jobs.
- Phase 2: real GitHub repo (branches, PRs), tests run in Docker, GitHub Actions deploy to staging.
- Phase 3: Angular UI (office floor, task board, approvals, cost dashboard), user picks model per department.
- Phase 4: Research + Architecture departments, smart model routing per task.

## Phase 0 status
- Step 1 (written, not yet run): `src/config.ts` (hardcoded models + prices),
  `src/llm.ts` (`callLlm` wraps Anthropic + OpenAI behind one interface, returns
  text/tokens/cost/duration), `src/main.ts` (hello test for each agent).
- Step 2 (next): Dev and QA agents.
- Step 3: the loop with a budget cap.
- Decision: model selection stays hardcoded in `config.ts` until Phase 3. Keep it simple.

## Conventions
- pnpm, TypeScript, ESM (`"type": "module"`), run with `pnpm exec tsx --env-file=.env src/main.ts`
- Style: `async` arrow functions with `return` by default
- Works behind a corporate proxy; connection errors may be proxy-related

## How to work with me
- Keep explanations short. Go step by step, code first, explain the *why* briefly.
- Angular comparisons help.
