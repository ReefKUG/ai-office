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

That's the whole system for Phase 0. Phase 1 replaces the in-memory `Map` in
`store.ts` with a real Postgres database and turns the orchestrator into a
proper job queue (BullMQ) — the ticket/ID model itself doesn't change.
