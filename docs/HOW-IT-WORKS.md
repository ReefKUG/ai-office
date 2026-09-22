# How Phase 0 works

This explains what happens when you run `pnpm start`, in plain terms.

## The big idea

One "department" (an AI model) writes code. A different department checks it.
If the check fails, the first one tries again — up to 3 times — while we track
how much money we're spending. No department ever talks to another department
directly. A single coordinator (`orchestrator.ts`) is the only thing that talks
to everyone, one at a time.

Angular comparison: departments are sibling components. They never call each
other. A parent component (the orchestrator) passes data down to one child,
reads what comes back up, and decides what to pass into the next child.

## The cast of files

| File | What it is |
|---|---|
| `src/config.ts` | Which AI provider/model each department uses, prices, budget cap, max loop count. |
| `src/llm.ts` | `callLlm(department, prompt)` — sends a prompt to whichever provider that department is configured for, returns the reply plus cost/tokens/duration. Existed before this session. |
| `docs/office-contracts.ts` | The shape of the three kinds of "tickets" (see below). Just type definitions, no logic. |
| `src/store.ts` | Where tickets live. Right now: a plain in-memory list (`Map`). Later (Phase 1): a real database. |
| `src/agents/dev.ts` | Turns a spec (+ optional past feedback) into the exact prompt text to send the build department. No I/O — just string building. |
| `src/agents/qa.ts` | Turns a spec + code into the exact prompt text to send the review department, and reads its PASS/FAIL reply back out. Also no I/O. |
| `src/orchestrator.ts` | The coordinator. Runs the actual loop described below. |
| `src/main.ts` | The entry point. Makes up one example task and kicks off the orchestrator. |

## The three kinds of tickets ("artifacts")

Defined in `docs/office-contracts.ts`. Each one gets a random ID when created.

1. **Spec** — the task: a title, a description, and a checklist of rules the
   code must satisfy ("acceptance criteria").
2. **Code** — one department's attempt at the spec. Stores *which spec it's
   for* (`specId`) and, if this is a retry, *which review caused the retry*
   (`previousReviewId`) — not the actual spec or review text, just their IDs.
3. **Review** — QA's verdict on one piece of code. Stores *which spec* and
   *which code* it's judging (`specId`, `codeId`), plus PASS/FAIL and why.

Why IDs instead of copying the full spec/code into every ticket? So there's
one source of truth — if you needed to change the spec, everything pointing
at it stays in sync — and so you can trace history later ("show me every
review ever done against spec #123").

**Important:** these IDs are an internal bookkeeping detail. The AI models
never see them. When the orchestrator builds a prompt, it looks up what an ID
points to and pastes the *real text* into the prompt — the AI just sees plain
English/code.

## The actual flow, step by step

Run: `pnpm exec tsx --env-file=.env src/main.ts`

1. **`main.ts`** invents a sample spec ("write a FizzBuzz function" + 4 rules),
   saves it to the store. It gets an ID, say `spec-abc`.

2. **`main.ts`** calls `runTask("spec-abc")`, handing control to the orchestrator.

3. **Orchestrator, loop iteration 1:**
   - Looks up `spec-abc` to get the real spec text.
   - Builds a Dev prompt (`buildDevPrompt`) from that text.
   - Calls `callLlm("build", prompt)` → this hits Anthropic (Claude), gets code back.
   - Saves that code as a new ticket, `code-1`, linked to `spec-abc`.
   - Builds a QA prompt (`buildQaPrompt`) from the spec + that code.
   - Calls `callLlm("review", prompt)` → this hits OpenAI (GPT-4o) — a
     *different provider on purpose*, so QA doesn't share Dev's blind spots.
   - Parses the reply into PASS/FAIL + feedback, saves it as `review-1`,
     linked to both `spec-abc` and `code-1`.

4. **If PASS:** stop, report total cost.

5. **If FAIL:** loop again — same steps, but this time `buildDevPrompt` is
   given `review-1` too, so Dev's next prompt includes QA's actual complaint.
   Repeat up to `MAX_REVIEW_LOOPS` (3) times, or stop early if running total
   cost crosses `BUDGET_CAP_USD` ($1).

6. **`main.ts`** prints the final PASS/FAIL and the total dollar cost.

## What each department actually sees

Neither Dev nor QA is aware any of this ticket/ID/store machinery exists.
Each one is a pure "text in, text out" function:

- Dev sees: *"Write code that satisfies this spec: ... Acceptance criteria: ..."*
  (and on a retry, *"...QA feedback on the previous revision: ..."*)
- QA sees: *"Here's a spec and some code. Reply PASS or FAIL and why."*

That's the whole system for Phase 0.

# How Phase 1 works

Phase 1 replaces the in-memory `Map` in `store.ts` with a real Postgres
database, adds a Fastify server so tasks can be submitted over HTTP instead
of hardcoded in `main.ts`, and turns the orchestrator's single blocking loop
into BullMQ jobs — the ticket/ID model itself doesn't change.

## The 5 new pieces

| Piece | Role | Analogy |
|---|---|---|
| **Postgres** | Permanent storage for Spec/Code/Review tickets. Replaces `store.ts`'s `Map`. | A filing cabinet — survives restarts. |
| **Prisma** | Lets the app read/write Postgres using typed TypeScript (`prisma.spec.create(...)`) instead of raw SQL. | A typed client generated from your DB schema, like a typed API client generated from an OpenAPI spec. |
| **Fastify** | Web server. Listens for HTTP requests (`POST /tasks`, `GET /tasks/:id`) instead of `main.ts` hardcoding one sample spec. | Angular's `HttpClient`, but receiving requests instead of sending them. |
| **BullMQ** | Job queue. Turns each Build/Review step into a job a worker picks up, so the API doesn't block for 30+ seconds of LLM calls. | An NgRx effect — dispatch an action, a worker handles it async, then dispatches the next one. |
| **Redis** | In-memory store BullMQ uses to track pending/running jobs. Not a source of truth — just the in-tray. | An `RxJS Subject` many workers can pull jobs from. |

## How they connect, using our own flow

```
POST /tasks (a Spec)
      │
      ▼
 1. Fastify route ──── 2. Prisma saves Spec ──── 3. Postgres
      │
      ▼
 4. Enqueue "build" job ──── 5. BullMQ writes it ──── 6. Redis
                                                          │
                                                          ▼
                                          7. Build worker picks it up,
                                             calls callLlm("build", ...),
                                             saves Code via Prisma,
                                             enqueues a "review" job
                                                          │
                                                          ▼
                                          8. Review worker: same pattern,
                                             saves Review, and either
                                             enqueues another "build" job
                                             (on FAIL) or marks the task
                                             done (on PASS/caps hit)
```

1. **The entry point (Fastify):** a client (you, curl, or eventually the
   Phase 3 UI) posts a Spec to `/tasks`.
2. **Saving the data (Prisma → Postgres):** the route handler saves the Spec
   as a row and gets back an ID — same concept as `saveArtifact` today, just
   backed by a real table instead of a `Map`.
3. **Handing off the work (Fastify → BullMQ):** the route doesn't wait
   around for the LLM calls. It enqueues a `build` job and responds
   immediately with the task ID.
4. **The queue (BullMQ → Redis):** the job description ("build code for spec
   X") is written to Redis, which can track pending jobs instantly since
   it's all in RAM.
5. **The background worker:** a separate process pulls the job off the
   queue, does the actual `callLlm` call (this is the slow part), saves the
   result, and enqueues whatever comes next — exactly mirroring today's
   `runTask` loop, just spread across independent, resumable steps instead
   of one function that blocks until everything finishes.

Same budget cap, same review-loop cap, same "QA must use a different
provider than Build" rule — they just move from a `while` loop's local
variables into checks the worker makes before enqueuing the next job.