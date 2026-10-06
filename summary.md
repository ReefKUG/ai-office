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

## 2026-10-05 — Session summary

Phase 1 Step 2 done: packages installed and database schema in place. The
app still runs the Phase 0 in-memory loop; nothing uses Postgres/Redis yet.

**Important: packages are installed locally, not globally.** Prisma, tsx,
etc. live in the project's `node_modules`, so their CLIs must be run via
`pnpm exec` (e.g. `pnpm exec prisma --version`) or the `package.json`
scripts. Plain `prisma` fails with "'prisma' is not recognized". Local
installs pin the version per project, so every machine/CI gets the same one.

### Branch `chore/phase1-deps` (merged, PR #1)
- Added `fastify`, `prisma` (dev) + `@prisma/client`, `bullmq`, `ioredis`.
- Pinned `prisma` and `@prisma/client` to exactly `7.10.0`: npm's `latest`
  tag pointed at an 8.0 RC, which mismatched the client and pulled in
  `workerd` (and ~290 extra packages). Removed the leftover
  `workerd: set this to true or false` placeholder from `pnpm-workspace.yaml`.
- `ioredis` is a **peer dependency** of BullMQ 6 — we install it ourselves.
- Known pre-existing warning: `openai@4` wants `zod` v3, v4 is installed.

### Branch `feat/prisma-schema` (pushed, PR #2)
- `prisma/schema.prisma`: `Spec`, `Code`, `Review` mirror
  `docs/office-contracts.ts`. Artifacts reference each other by ID through
  **foreign keys** — Postgres now enforces the "reference, never embed" rule.
- `LlmCall` table: one row per LLM call (department, provider, model,
  tokens, `costUsd`, `durationMs`). Linked to the Code *or* Review it
  produced via **two optional foreign keys** (`codeId?`, `reviewId?`)
  instead of one unprotected `artifactId` — a foreign key can only point to
  one table. `costUsd` is `Decimal(12,6)` so totals are exact (no float
  rounding).
- Delete rules: Spec with Code/Reviews can't be deleted (RESTRICT);
  deleting a Code/Review keeps its LlmCall rows and nulls the link
  (SET NULL), so cost history survives.
- `prisma.config.ts`: Prisma 7 moved the DB URL out of the schema into this
  file and doesn't read `.env` itself — loaded with Node's built-in
  `process.loadEnvFile()` instead of adding `dotenv`.
- `.env`: `DATABASE_URL="postgresql://office:office@localhost:5432/office?schema=public"`,
  built from `docker-compose.yml` (user:password@host:port/db).
- First migration `init` applied (4 tables, 5 foreign keys), saved in
  `prisma/migrations/` and committed. Generated client goes to
  `generated/prisma/` (gitignored, rebuilt by `pnpm db:generate`).
- Scripts: `pnpm db:migrate`, `pnpm db:generate`, `pnpm db:studio`.
- Verified with SQL inside a rolled-back transaction: valid chain inserts
  and joins; bad IDs and unsafe deletes rejected; SET NULL keeps cost rows;
  sum is exact. `tsc` clean, Phase 0 app still passes.
- `prisma init` also generated AI-editor skill folders (`.agents/`,
  `.claude/skills/`, `.windsurf/`, `skills-lock.json`) — deleted, never
  committed.

Next up: merge PR #2, then the remaining Phase 1 branches, one each:
1. `feat/db-store` — add `@prisma/adapter-pg` (Prisma 7 needs a driver
   adapter for the client), replace in-memory `store.ts` with Postgres,
   record every call in `LlmCall`.
2. `feat/state-machine` — `Task` table with status; orchestrator moves a
   task through states instead of one loop.
3. `feat/bullmq-queue` — each step becomes a job; Redis gets connected here.
4. `feat/fastify-api` — `POST /tasks`, `GET /tasks/:id`.
Then tag `v0.2.0`.

## Command reference

All project tools are installed **locally** — run them through `pnpm`
(scripts or `pnpm exec`), never as bare global commands.

### Run the app
| Command | Use case |
|---|---|
| `pnpm start` | Run the office (Spec → Build → Review loop), prints total cost. Same as `pnpm exec tsx --env-file=.env src/main.ts` |
| `pnpm exec tsc --noEmit` | Type-check the whole project without building; run before committing |

### Packages
| Command | Use case |
|---|---|
| `pnpm install` | Install everything from `package.json` / lockfile (after cloning or pulling) |
| `pnpm add <pkg>` / `pnpm add -D <pkg>` | Add a runtime / dev-only package |
| `pnpm add --save-exact <pkg>@<version>` | Pin an exact version (e.g. Prisma, where CLI and client must match) |
| `pnpm exec <tool>` | Run a locally installed CLI (`prisma`, `tsx`, `tsc`) |
| `pnpm why <pkg>` | Show who depends on a package and which versions are installed |
| `pnpm view <pkg> dist-tags` | See npm's `latest`/`next` tags before installing (catches RCs tagged as latest) |

### Docker (Postgres + Redis)
| Command | Use case |
|---|---|
| `docker compose up -d` | Start Postgres and Redis in the background |
| `docker compose ps` | Check both containers are `Up` |
| `docker compose logs postgres` | See a container's logs when something fails to connect |
| `docker compose stop` | Stop containers, keep data |
| `docker compose down` | Remove containers; Postgres data survives in the `postgres_data` volume |
| `docker compose exec postgres psql -U office -d office` | Open a SQL shell inside the Postgres container (`\dt` lists tables, `\q` quits) |

### Database (Prisma)
| Command | Use case |
|---|---|
| `pnpm db:migrate --name <name>` | After editing `schema.prisma`: create a migration, apply it to Postgres |
| `pnpm db:generate` | Rebuild the typed client in `generated/prisma/` (after schema changes or a fresh clone) |
| `pnpm db:studio` | Browse and edit table data in the browser |
| `pnpm exec prisma validate` | Check `schema.prisma` for errors without touching the database |
| `pnpm exec prisma --version` | Confirm CLI and client versions match |

### Git (branch per change)
| Command | Use case |
|---|---|
| `git checkout main && git pull` | Get the latest `main` after a PR is merged |
| `git checkout -b <type>/<name>` | Start a new branch (`feat/`, `chore/`, `fix/`, `docs/`, `test/`) |
| `git status` / `git diff` | See what changed before committing |
| `git add <files>` + `git commit` | Save a step on the branch |
| `git push -u origin <branch>` | Push the branch, then open the PR on GitHub |
| `git tag v0.x.0 && git push --tags` | Mark the end of a phase (`v0.1.0` = Phase 0, `v0.2.0` = Phase 1) |
