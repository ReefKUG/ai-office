# How it works (Phase 1)

This explains what happens when a task is submitted, in plain terms.

## The big idea

One "department" (an AI model) writes code. A different department checks it.
If the check fails, the first one tries again — up to 3 times — while we track
how much money we're spending. No department ever talks to another department
directly. A single coordinator (`orchestrator.ts`) is the only thing that talks
to everyone, one at a time.

Angular comparison: departments are sibling components. They never call each
other. A parent component (the orchestrator) passes data down to one child,
reads what comes back up, and decides what to pass into the next child.

## The moving parts

```
 client (curl / pnpm start / later the UI)
      │  POST /tasks
      ▼
 ┌─────────┐   save Spec + Task   ┌──────────┐
 │ Fastify │ ───────────────────> │ Postgres │  <── all state + artifacts live here
 │  (API)  │                      └──────────┘
 └─────────┘                           ▲
      │ enqueue "advance task X"       │ read / write Task, Code, Review, LlmCall
      ▼                                │
 ┌─────────┐   take job          ┌──────────┐   callLlm   ┌──────────┐
 │  Redis  │ ──────────────────> │  worker  │ ──────────> │   LLMs   │
 │ (queue) │ <────────────────── │          │             └──────────┘
 └─────────┘   next job if        └──────────┘
               task not finished
```

| Piece | Role | Analogy |
|---|---|---|
| **Fastify** (`src/server.ts`, `src/routes/`) | HTTP API. Creates tasks and reads their state. Never calls an LLM. | The component layer — it just calls services. |
| **Postgres + Prisma** (`src/store.ts`) | Permanent storage for artifacts (Spec/Code/Review), Task state and every LLM call's metrics. | A filing cabinet that survives restarts. |
| **Orchestrator** (`src/orchestrator.ts`) | The state machine. `advanceTask(taskId)` runs exactly one step. | A reducer: `(state) → next state`. |
| **BullMQ + Redis** (`src/queue.ts`) | Job queue. A job is just `{ taskId }` — "run the next step of this task". | The in-tray. Not a source of truth. |
| **Worker** (`src/worker.ts`) | Separate process. Takes a job, calls `advanceTask`, queues the next job until the task is finished. | An NgRx effect — reacts, does the async work, dispatches the next step. |

## The task state machine

Each task is a row in the `Task` table: `status`, `loop`, `totalCostUsd`,
`lastCodeId`, `lastReviewId`.

```
BUILDING ──> REVIEWING ──> PASSED
   ^             │
   └── FAIL ─────┤──> FAILED_MAX_LOOPS (loop limit hit)
                 └──> FAILED_BUDGET    (checked before every LLM call)
```

`advanceTask(taskId)`:
1. Reads the task from Postgres. Already finished → does nothing.
2. Spent ≥ `BUDGET_CAP_USD`? → `FAILED_BUDGET`.
3. `BUILDING` → builds the Dev prompt, calls the build LLM (Claude), saves the
   Code, sets `REVIEWING`.
4. `REVIEWING` → builds the QA prompt, calls the review LLM (GPT-4o — a
   *different provider on purpose*, so QA doesn't share Dev's blind spots),
   saves the Review, then sets `PASSED`, `BUILDING` (retry) or `FAILED_MAX_LOOPS`.

One call = one LLM call = one status change. Because all state is in Postgres,
a crash loses at most the step that was running; BullMQ retries the job
(3 attempts, exponential backoff) and the task carries on from its last status.

## The three kinds of tickets ("artifacts")

Defined in `docs/office-contracts.ts`, stored in Postgres (`prisma/schema.prisma`).

1. **Spec** — the task: a title, a description, and a checklist of rules the
   code must satisfy ("acceptance criteria").
2. **Code** — one attempt at the spec. Stores *which spec it's for* (`specId`)
   and, on a retry, *which review caused it* (`previousReviewId`) — IDs, not text.
3. **Review** — QA's verdict on one piece of code: `specId`, `codeId`,
   PASS/FAIL and why.

Why IDs instead of copying? One source of truth, traceable history, and each
prompt stays small: the orchestrator looks up only the pieces a department
needs and pastes the *real text* into the prompt. The AI models never see IDs.

Every LLM call is also saved as an `LlmCall` row (provider, model, tokens,
cost, duration), linked to the Code or Review it produced.

## What each department actually sees

Neither Dev nor QA knows any of this machinery exists. `src/agents/dev.ts`
and `src/agents/qa.ts` are pure "text in, text out" prompt builders:

- Dev sees: *"Write code that satisfies this spec: ... Acceptance criteria: ..."*
  (and on a retry, *"...QA feedback on the previous revision: ..."*)
- QA sees: *"Here's a spec and some code. Reply PASS or FAIL and why."*

## API

| Route | Does |
|---|---|
| `POST /tasks` `{ title, description, acceptanceCriteria[] }` | Saves the Spec, creates the Task, queues the first step. Replies `201` immediately. |
| `GET /tasks/:id` | Live status, loop and cost so far. |
| `GET /tasks/:id/code` | The latest code Dev wrote. |

Bad body → `400`, unknown ID → `404`, anything unexpected → plain `500`
(details only in the server log).

## Running it

```
docker compose up -d     # Postgres + Redis
pnpm db:migrate          # first time / after schema changes
pnpm worker              # terminal 1 — runs the LLM steps
pnpm api                 # terminal 2 — http://localhost:3000
pnpm start               # terminal 3 — demo client: submits a task and polls it
```

## How we got here

- **Phase 0** (`v0.1.0`): one script, in-memory `Map` store, a single blocking
  `runTask` loop.
- **Phase 1** (`v0.2.0`): Postgres via Prisma, the loop split into a resumable
  state machine, steps run by a BullMQ worker, Fastify API in front.
