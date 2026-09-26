# InsightPrep

AI-powered interview preparation kits generated from a job description and a company website: company research, requirement extraction, questions, flashcards, and a deterministic day-by-day study schedule — plus an editable builder, safe section-by-section regeneration, and a flashcard practice mode with confidence tracking.

## Architecture

```
                    ┌────────────────────────────┐
                    │          Browser             │
                    │   (React 19, rendered pages) │
                    └──────────────┬───────────────┘
                                   │ HTTPS, JSON, httpOnly session cookie
                                   ▼
                    ┌────────────────────────────┐
                    │   Next.js 16 (App Router)    │
                    │   frontend/  — port 3000     │
                    └──────────────┬───────────────┘
                                   │ fetch() via lib/api/* (one typed
                                   │ function per backend endpoint)
                                   ▼
                    ┌────────────────────────────┐
                    │      Express API (backend)   │
                    │      backend/  — port 5000    │
                    │                               │
                    │  auth · kits · research ·     │
                    │  generation · regeneration ·  │
                    │  practice · evaluation        │
                    └───────┬───────────┬───────────┘
                            │           │
                Mongoose    │           │ @google/genai SDK
                            ▼           ▼
                 ┌──────────────┐  ┌───────────────────────┐
                 │   MongoDB    │  │   Google Gemini API     │
                 │   (Atlas)    │  │   (structured JSON       │
                 │ users, kits  │  │   generation, per-call   │
                 └──────────────┘  │   zod re-validation)     │
                                    └───────────────────────┘

     The backend also makes outbound HTTPS requests directly to the
     target company's website during research — a bounded, robots.txt-
     respecting, SSRF-checked crawl (see "Company Research" below).
```

## Tech Stack

**Backend** (`backend/`)
- Node.js + TypeScript, Express 5
- MongoDB (Atlas) via Mongoose — one `Kit` document per prep kit, one `User` document per account
- Zod — request validation, and the single `draftKitSchema` reused as the one source of truth across generation, edits (Phase 10), regeneration (Phase 11), and practice (Phase 12)
- `@google/genai` (Gemini) — structured JSON generation only; every response is independently re-validated, never trusted blindly
- `jsonwebtoken` + `bcryptjs`, httpOnly cookies — session auth
- `cheerio` — HTML cleaning/text extraction during company research
- `helmet`, `cors`, `morgan`, `cookie-parser` — standard Express hardening/logging middleware
- Vitest + Supertest — unit and integration tests; integration tests spin up a real disposable local `mongod` process rather than mocking the database
- `tsx` — dev/watch server and the CLI batch evaluator entry point

**Frontend** (`frontend/`)
- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 — a small hand-built component set (`components/ui`, `components/feedback`, `components/layout`), no UI component library
- No client state library — plain `useState`/`useEffect`, one typed `fetch` wrapper per API domain (`lib/api/*`)

**Tooling**
- ESLint (frontend), `tsc --noEmit` typecheck scripts (both apps)
- Playwright — installed ephemerally per manual verification pass (not a persisted dependency) to drive real-browser checks against the live backend + database

## Data Flow

```
 1. Register / Login  ───────────────────────────────►  httpOnly session cookie issued
                                                                  │
 2. Dashboard  ◄──────────────────────────────────────────────────┘
      │  "Create a new kit": job description + company URL + days available
      ▼
 3. POST /api/kits                     kit saved, generationStatus = "idle"
      │
      ▼
 4. POST /api/kits/:id/generate
      │
      ├─► Research (company-research.service)   bounded crawl, robots.txt, SSRF-checked
      │
      ├─► Requirement extraction (Gemini)  ────────────►  role.requirements[]
      ├─► Company brief (Gemini, grounded in research; sources set by app code)
      ├─► Role analysis (Gemini, echoes the same requirements)
      ├─► Question generation × 4 categories (Gemini)  ──►  questions[]
      │        │
      │        ▼
      ├─► Coverage check (deterministic, no Gemini)  ──►  any MUST requirement uncovered?
      │        │ yes                                            │ no
      │        ▼                                                │
      │  Second-pass targeted question generation (Gemini)      │
      │        │                                                │
      │        └───────────────────┬────────────────────────────┘
      │                            ▼
      ├─► Flashcard generation (Gemini)  ──────────────►  flashcards[]
      │
      ├─► Deterministic schedule allocation (no Gemini)  ──►  schedule.days[]
      │
      └─► validateDraftKit()  ──►  persisted, generationStatus = "completed"
      │
      ▼
 5. Kit Detail page
      Today's Focus (today's schedule day) · stats · Role & Requirements ·
      Coverage · Company Brief / Questions / Flashcards (editable) ·
      Schedule (read-only, day-by-day) · Practice entry point
      │
      ├─► PATCH /api/kits/:id                     edit brief / questions / flashcards
      │        origin + edited tracked per item — never silently overwritten
      │
      ├─► POST /api/kits/:id/regenerate            redo exactly one section:
      │        target: company_brief | schedule | one question category
      │        protects origin === "user" || edited === true
      │
      └─► Practice flashcards
               PATCH /api/kits/:id/flashcards/:id/practice   confidence: low | medium | high
               priority order each session: never-practiced → low → medium → high
```

## Running Locally

Both apps read from their own `.env` (`backend/.env`, `frontend/.env.local`) — see each app's `.env.example` for the full list of required variables (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY` for the backend; `NEXT_PUBLIC_API_URL` for the frontend).

```bash
# terminal 1 — backend, http://localhost:5000
cd backend
npm install
npm run dev

# terminal 2 — frontend, http://localhost:3000
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`, register an account, and create a kit. Generating a kit calls the real Gemini API, so it's subject to whatever rate limit/quota the configured `GEMINI_API_KEY` has — every other endpoint (editing, regenerating the schedule, practicing flashcards) works against already-persisted data and doesn't require a fresh Gemini call except regenerating the brief or a question category.

## Company Research / Retrieval Pipeline

Given a `company_url`, `backend/src/services/research/company-research.service.ts` orchestrates a bounded, prioritised crawl and returns structured, cleaned page data for later AI phases to consume. No LLM is involved in this phase — everything is deterministic.

**Flow**: validate URL → fetch homepage → extract + rank same-site links → fetch the highest-scoring candidates first → repeat up to `CRAWLER_MAX_DEPTH` while the `CRAWLER_MAX_PAGES` budget lasts → clean each page's HTML into text.

**Link ranking** (`link-ranking.service.ts`) is a transparent, deterministic point score, not a fixed allowlist:
- Hiring-related keywords in the URL path or anchor text (`career`, `hiring`, `interview`, `culture`, `handbook`, …) score highest, so the limited page budget favours discovering interview-relevant content.
- Company/product keywords (`about`, `product`, `platform`, …) score next.
- Engineering/blog keywords score a bit lower.
- Login/account/asset/legal-type paths (`login`, `cart`, `privacy`, `.pdf`, …) are penalised.
- Off-site links score sharply lower than same-site links; deeper paths are penalised slightly.

This lets pages with unexpected paths (e.g. `/life-at-company`, `/inside-engineering`) still be discovered through keyword matching rather than requiring `/careers` or `/about` to exist literally.

**Crawl limits** (env-configurable, sensible defaults applied): `CRAWLER_MAX_PAGES` (6), `CRAWLER_MAX_DEPTH` (2), `CRAWLER_MAX_RESPONSE_BYTES` (2MB), `CRAWLER_TIMEOUT_MS` (8s), `CRAWLER_MAX_RETRIES` (2), `CRAWLER_REQUEST_DELAY_MS` (300ms between requests). These keep the crawl bounded and polite rather than an open-ended web crawler.

**robots.txt**: fetched once per domain per research request and cached for that crawl (`services/retrieval/robots.service.ts`). Only the wildcard (`User-agent: *`) group is respected; a missing or unreachable robots.txt is treated as "allow all" (the same default most crawlers use, since its absence isn't a restriction signal).

**Rate limiting & retries**: a fixed delay is applied between sequential page fetches. Failed requests are retried with bounded exponential backoff only for transient failures — timeouts, connection errors, `429`, and `5xx` — never for `4xx` client errors like `404`/`403`, and never beyond `CRAWLER_MAX_RETRIES`.

**SSRF protection** (`services/retrieval/url-validation.service.ts`): the target URL's protocol is restricted to `http`/`https`, and both the literal hostname and its resolved DNS addresses are checked against private, loopback, link-local, and other non-public IPv4/IPv6 ranges (real range classification, not string matching). This is enforced by default. The batch evaluator needs to target a `localhost` test server, so this check is bypassable only via the explicit `ALLOW_LOCAL_RESEARCH_TARGETS=true` env flag or an explicit `allowLocalTargets` option — never enabled implicitly, and must stay off in production.

**Untrusted content**: everything retrieved from a company's website is treated as data, never instructions. Page text is only ever placed in the research result's `text`/`title` fields — this phase does not call an LLM at all, and future prompts must keep this content in a clearly separated "untrusted" section.

**Partial failure model**: `CompanyResearchResult.status` is one of `success` (homepage + all attempted subpages succeeded), `partial` (homepage succeeded, some subpages failed — those pages are recorded in `failures` but do not remove the pages that did succeed), or `failed` (the homepage itself was unreachable). A missing hiring/careers page is never fabricated — if none is found, `hiringPages` is empty and a `warnings` entry says so honestly, without affecting `status`.

**API**: `POST /api/research/company` (requires authentication), body `{ "company_url": "https://example.com" }`. This is a development/testing endpoint for the retrieval pipeline; it does not persist results yet.

**Known limitations**:
- Same-site detection uses a naive last-two-labels heuristic (no public suffix list), so multi-part TLDs like `.co.uk` aren't handled precisely.
- Query strings are stripped during URL normalisation, which occasionally collapses distinct paginated/filtered pages into one.
- Keyword-based classification can misfire on coincidental substrings (e.g. a customer named "Jobber" matching the `job` hiring signal).
- robots.txt handling only respects the wildcard `*` group, not rules scoped to specific named crawlers.

## AI Generation Architecture

Given a job description, a company URL, and the Phase 4 research result, `backend/src/services/generation/kit-generation.service.ts` runs a fixed sequence of small, separately-validated Gemini calls to produce a first-pass draft kit — never one giant prompt:

```
JD                              -> requirement extraction         -> requirements (r1, r2, ...)
Phase 4 research                -> company brief                  -> company_brief
JD + requirements + research    -> role analysis                  -> role (echoes the same requirements)
requirements + role + research  -> technical questions              \
requirements + role + research  -> behavioural questions             |
role + research                 -> system-design questions           > questions (q1, q2, ...)
role + research                 -> company-fit questions            /
requirements + questions        -> flashcards                     -> flashcards (f1, f2, ...)
```

Gemini is responsible for reasoning/generation only. Deterministic concerns stay entirely outside the model, in application code: **stable IDs** (never trusted to the model), **coverage** (`uncovered_requirement_ids`/`passes` — see below), and **schedule allocation** (`schedule.days` — see "Deterministic Schedule Allocation" below).

**Gemini client** (`services/ai/gemini.client.ts`): a single generic `generateValidated<T>({ systemInstruction, prompt, responseJsonSchema, schema })` function used by every generation service. It never contains requirement/question-specific logic. It has two independent, bounded layers:
- **Network retry** (`GEMINI_MAX_RETRIES`, default 2): bounded exponential backoff, only for rate limits (`429`) and provider outages (`5xx`/timeout) — never for a rejected request (`4xx`).
- **Repair retry** (1 attempt by default): if the response isn't valid JSON, or fails zod validation (including custom checks like "every `requirement_ids` entry must reference a real requirement"), the client asks Gemini once more with a corrective note before giving up. These two layers are deliberately separate and both bounded, so a flaky network error and a malformed response can't multiply into a retry explosion.

**Model**: `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_API_KEY`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_RETRIES` — all environment-configurable, documented in `.env.example`. The key is read server-side only and never reaches the frontend.

**Structured output validation**: every response is both requested in a constrained shape (`responseJsonSchema` passed to Gemini's structured-output mode) and independently re-validated in application code with zod — provider-side constraints are a best-effort optimisation, not a substitute for the application check. IDs (`r1`, `q1`, `f1`, ...) are assigned by application code after validation, never by the model, so duplicate or unstable IDs are structurally impossible. Question/flashcard schemas are built per-call with the current requirement ID set baked in, so a reference to a nonexistent requirement fails validation the same way a malformed field would.

**Prompt injection handling** (`services/ai/prompts/shared-instructions.ts`): every prompt places the job description and company research inside explicit `<JOB_DESCRIPTION>`/`<COMPANY_RESEARCH>`/`<REQUIREMENTS>`/`<ROLE_CONTEXT>` blocks, preceded by a fixed warning that this content is untrusted data to analyse, never instructions to follow. A label's own closing tag is stripped out of the wrapped content first, so untrusted text can't forge a premature end to its block and bleed into the trusted instructions that follow.

**Grounding, not invention**: company-brief `sources` are set by application code from the actual Phase 4 pages used — the model is never asked for URLs at all, so a hallucinated source is structurally impossible. Role analysis echoes the already-extracted requirement objects rather than producing a second set. Technical/behavioural questions are skipped entirely (no Gemini call) when there are zero requirements of that kind, rather than relying on the model to self-restrict.

**Thin JD / sparse research**: a two-line JD is expected to produce a short requirements list, possibly an empty one — the extraction prompt explicitly says an empty/short list is the correct output. Empty company research produces an honest limited brief ("no usable company information could be retrieved") without calling Gemini at all, and downstream question generation just has less context to work with rather than failing.

**API**: `POST /api/kits` (create; stores `source.job_description`/`company_url`/`days_available`), `GET /api/kits/:kitId`, `POST /api/kits/:kitId/generate` — all require authentication and enforce kit ownership. `generate` runs Phase 4 research then this pipeline, tracks `generationStatus` (`idle` → `researching` → `generating` → `completed`, or `failed` with a persisted structured `generationError`), validates the draft against the same kit validator used everywhere else, and persists it.

**Known limitations**:
- No live Gemini connectivity has been exercised in this environment (no API key configured here) — the pipeline is verified via mocked-SDK unit/integration tests and a live smoke test that confirms it fails cleanly (`LLM_NOT_CONFIGURED`) rather than crashing or persisting bad data; it has not been run end-to-end against the real API.
- Kit persistence (model/validator/CRUD) did not exist before this phase — it was added here as the minimal prerequisite for `/generate` to have somewhere to read from and write to. Editing, reordering, and regeneration are still out of scope.
- Question/flashcard counts are bounded by prompt instruction (max 8 questions per category, max 12 flashcards), topped up by the second pass described below.

## Coverage & Second-Pass Generation

**Coverage algorithm** (`services/validation/coverage.service.ts`): a requirement is "covered" if and only if at least one generated question's `requirement_ids` includes its id. This is a pure, synchronous comparison of two ID sets — `role.requirements[].id` against the union of every `questions[].requirement_ids` — nothing else. It never inspects question/answer text, flashcard content, or the company brief, and Gemini is never asked whether a requirement is covered; the application is the sole authority. `checkCoverage()` returns `covered_requirement_ids`, `uncovered_requirement_ids`, and — because the assignment's completion bar is specifically about MUST requirements — `uncovered_must_requirement_ids`/`uncovered_nice_requirement_ids` separately, plus a `coverage_complete` flag that is `true` whenever `uncovered_must_requirement_ids` is empty (an uncovered nice-to-have never blocks completion).

**Second pass**: `kit-generation.service.ts` runs `checkCoverage()` once immediately after first-pass question generation. If any MUST requirement is uncovered, it makes exactly one additional, targeted Gemini call (`generateMissingQuestions`, in `missing-question-generation.service.ts`) containing only the uncovered MUST requirement objects — never a full re-generation, and never one call per requirement. The prompt states explicitly that these requirements were not covered by the first pass and that every one of them must be referenced by at least one returned question (enforced by a zod schema built per-call with that exact requirement-id set, so a response that still misses one fails validation and triggers the Gemini client's existing bounded repair retry — no new retry mechanism was added). New questions get new sequential IDs continuing from the existing set (e.g. first pass ends at `q5`, second pass adds `q6`, `q7`, ...); existing questions, flashcards, the company brief, and the requirement list are never touched. `checkCoverage()` then runs again on the combined question set.

**Pass limit**: `MAX_COVERAGE_PASSES = 2`, a fixed constant in `kit-generation.service.ts`. In practice this means "one coverage check, and if it finds a MUST gap, one targeted top-up plus one recheck" — implemented as a single `if` block rather than a loop, so no infinite-loop path exists by construction, not just by a runtime counter. Two passes is enough to close nearly everything the model can reasonably answer without risking runaway calls against a free-tier API; any MUST requirement still uncovered after pass 2 is reported honestly in `coverage.uncovered_requirement_ids` rather than the kit being blocked or coverage being misreported as complete.

**Model vs. deterministic logic**: Gemini generates question text and picks a requirement-appropriate category (technical/behavioural/system-design/company-fit) for second-pass questions — RULES.md section 13 explicitly allows that category choice to involve model reasoning. Whether a requirement counts as *covered* is never something Gemini decides; that is a pure ID-set comparison in application code, independent of and downstream from whatever the model produced.

## Deterministic Schedule Allocation

**Gemini never generates the schedule.** `services/scheduling/schedule.service.ts` runs after the final coverage pass, on the final question set, and is pure/synchronous — no Gemini import, no HTTP, no MongoDB — so the same `(daysAvailable, questions, requirements)` input always produces the exact same output. Gemini's job ended earlier in the pipeline: it already decided each question's `difficulty`, `category`, and `requirement_ids`. The scheduler only decides *placement, order, and timing* of the questions that already exist — it never invents a question.

**Priority score** (`schedule.utils.ts`, `scoreQuestion`): each question gets a deterministic score —

```
score = mustCoverageCount × 100 + difficulty × 10 + distinctRequirementCount × 1
```

The weights are an order of magnitude apart on purpose so each tier strictly dominates the next: covering one more MUST requirement always outranks any difficulty difference, and difficulty always outranks the requirement-breadth tiebreaker. Duplicate requirement ids inside a single question are deduped before counting. Ties (equal score) are broken by the question's numeric id suffix (`q2` before `q10`) — never randomness.

**MUST-requirement coverage strategy**: the scheduler sorts all questions by score, then makes a single greedy pass over that sorted list, selecting any question that still covers an unaddressed MUST requirement. Because the list is already sorted with MUST-coverage weighted heaviest, this naturally prefers a question that covers *multiple* MUST requirements over one that covers only one — without a more expensive true set-cover search. Selected ("required") questions are placed at the very front of the final ordering, ahead of everything else, guaranteeing every MUST requirement that the question set actually covers ends up scheduled. A MUST requirement with zero covering questions at all is never fabricated — that's the coverage phase's concern (`coverage.uncovered_requirement_ids`), not the scheduler's; RULES.md section 16 explicitly keeps these separate.

**Distribution**: the combined priority-ordered list (required questions first, then everything else in score order) is split into exactly `daysAvailable` contiguous, near-equal chunks — day 1 gets the front of the list. Any remainder from uneven division is spread across the earliest days rather than piled onto day 1 alone. When there are fewer questions than days, the arithmetic naturally leaves later days empty (`question_ids: [], minutes: 0`) — no special-casing needed, and never a fabricated question id.

**Minutes**: `difficulty 1 → 10 min`, `2 → 15 min`, `3 → 20 min`, summed per day — always an integer, always application-computed, never asked of Gemini.

**Focus**: derived from the set of categories present on a day, joined in a fixed order (`Technical fundamentals & Behavioural`, etc.); an empty day gets the honest label `"Review and consolidation"`. No LLM call, no fabricated company-specific text.

**Why not let the LLM do this**: minute totals and day boundaries require exact, repeatable arithmetic — an LLM asked to "add these up and split across N days" is neither guaranteed correct nor reproducible from run to run, and RULES.md explicitly disallows Gemini from deciding day allocation, minutes, ordering, or question-to-day assignment. Keeping it in application code makes the schedule auditable, unit-testable in isolation, and immune to prompt drift.

**Validation**: `validators/kit.validator.ts`'s existing `draftKitSchema` (already the single validator reused by every phase) was extended, not duplicated — `scheduleDaySchema` now validates real day objects (`day`/`focus`/`question_ids`/`minutes`, minutes as a non-negative integer) instead of `z.unknown()`, and the existing cross-field `superRefine` gained: `schedule.days_available` matches `source.days_available`, `days.length` matches `days_available`, day numbers run 1..N in order, every `question_id` exists among `questions[].id`, no question is scheduled on more than one day, and every MUST requirement that the final question set covers is represented somewhere in the schedule.

**Known limitations**: MUST-coverage selection is a documented single-pass greedy heuristic, not a true minimum set-cover search — in rare cases it could select one extra question where a more exhaustive search might not, though it never fails to cover a requirement that has a covering question available. There is no per-day maximum question count; with very large question sets and few days, a single day could carry many questions (not a practical concern given generation's own bounded question counts).

## Batch Evaluation

### Command

Run from `backend/` (this repo has no separate root package):

```
npm run evaluate -- --input cases.json --output kits.json
```

`--input` and `--output` are both required paths; the script is a thin wrapper (`tsx src/cli/evaluate.ts`) so it runs directly from a clean clone after `npm install`, with no separate build step required.

### Input

A JSON array of cases:

```json
[
  { "id": "case-1", "jd": "...", "company_url": "https://...", "days": 5 }
]
```

`id` must be a non-empty string and unique within the file (duplicate ids are rejected outright — the input is invalid rather than silently keeping only one of them or producing ambiguous duplicate results). `days` is validated against the same 1–60 bound the rest of the application enforces (`services/scheduling/schedule.service.ts`'s `MAX_SCHEDULE_DAYS`). `company_url`'s deeper syntax/SSRF validation is not duplicated here — it happens once, inside the pipeline itself, and a bad URL simply surfaces as that case's `error`.

### Output

```json
{
  "version": "1.0",
  "generated_at": "2026-01-01T00:00:00.000Z",
  "kits": [
    { "id": "case-1", "status": "ok", "kit": { "...": "a full DraftKit" } },
    { "id": "case-2", "status": "failed", "error": "LLM_UNAVAILABLE: Gemini is temporarily unavailable." }
  ]
}
```

Case order in `kits` always matches input order, one result per input case, `kit` only on success and `error` only on failure. Written atomically: the full result is serialized, written to a temp file next to the requested path, then renamed into place — a crash mid-write can never leave a corrupt `kits.json`.

### Pipeline

The evaluator does not reimplement anything. `services/evaluation/case-pipeline.service.ts` calls the exact same two functions `controllers/kit.controller.ts`'s HTTP `generate` endpoint calls — `researchCompany()` (Phase 4) and `generateDraftKit()` (Phases 5–7, which already runs requirement extraction, company brief, role analysis, category question generation, coverage checking, the bounded second pass, deterministic scheduling, and final `validateDraftKit()` internally). The CLI's own code is limited to argument parsing, file I/O, and per-case orchestration — no generation, research, coverage, or scheduling logic lives in `src/cli/` or `src/services/evaluation/`. Each case's own `days` value is what becomes that kit's `schedule.days_available` — there is no global default.

### Failures

Each case runs inside its own `try/catch` (`services/evaluation/batch-evaluation.service.ts`) — one case's failure (invalid input, unreachable research, an unconfigured or unavailable Gemini, a final-validation failure) never stops the rest of the batch, and never removes it from the file's `kits` array. Cases run with bounded concurrency (2 at a time by default, not exposed as a flag) rather than unbounded-parallel or fully sequential — this keeps Gemini call volume predictable without slowing a 5-case batch beyond the assessment's ~15-minute budget. No new retry layer was added around Gemini; the existing bounded client-level retries (Phase 5) are reused as-is. Failure messages are `code: message` only (e.g. `LLM_NOT_CONFIGURED: GEMINI_API_KEY is not configured.`) — never the raw error object, validation payload, job description, or research content, so nothing sensitive can end up in `kits.json`.

### Environment

The evaluator reads credentials from the same `.env` the server uses (see `.env.example`) — nothing is hardcoded, and the required variables are documented there, not here. If `GEMINI_API_KEY` is missing or invalid, cases fail individually with a structured `LLM_NOT_CONFIGURED`/`LLM_UNAVAILABLE` error rather than crashing the CLI; the output file is still written. Local/test company URLs (e.g. for a local evaluator fixture server) are only permitted when `ALLOW_LOCAL_RESEARCH_TARGETS=true` is explicitly set — the evaluator does not weaken or bypass Phase 4's SSRF protection, it just reads the same flag the HTTP endpoint already reads.

**Failure handling**: if the second-pass Gemini call fails (rate limit, timeout, persistent outage), the error is caught inside `generateDraftKit()` and logged — the first-pass questions, flashcards, requirements, and company brief are kept as-is, coverage is recomputed against the unchanged first-pass question set, and generation still completes with `coverage.passes = 2` and an honest (non-empty) `uncovered_requirement_ids`. A second-pass failure never erases first-pass work and never fails the whole kit.

## Frontend Foundation

`frontend/` is a Next.js 16 (App Router) + TypeScript + Tailwind v4 app, kept deliberately thin for this phase: authentication UI, an application shell, and a dashboard that lists/creates kits. It talks to the existing backend exactly as documented above — no new endpoints were invented except one (see below).

**Design system**: studied via the Hallmark design skill against `usehallmark.com/examples/garden-01` (structure only, not its cream/honey palette — see the design decision report in conversation history for the full reasoning). Selected theme: **Almanac** (editorial cluster), tuned rather than used as-is — warm off-white paper, a single muted terracotta accent (never blue/purple), Newsreader (display serif) + IBM Plex Sans (body) + IBM Plex Mono (structured data: requirement IDs, difficulty, day counts). Nav is an editorial masthead (top, restrained) per the product brief, overriding Almanac's own side-rail default. All tokens live in `frontend/src/app/globals.css`.

**Structure**: `app/(marketing)` (landing page, Narrative Workflow macrostructure — the real 5-step pipeline, not invented SaaS copy), `app/(auth)` (login/register, centered minimal shell), `app/(dashboard)` (masthead + footer shell, auth-gated), `components/{ui,layout,feedback}` (small hand-built primitives — no component library), `features/{auth,kits}` (forms, list/detail views), `lib/api` (one typed function per backend endpoint, one shared `apiRequest()` wrapper for base URL/cookies/error-shaping), `types/` (hand-mirrored from the backend's own types, snake_case preserved where the wire format uses it).

**Auth**: session lives behind the backend's httpOnly cookie, which client JS can't read directly — `AuthProvider` asks `GET /api/auth/me` once on load to establish session state, and every page reads it through `useAuth()`. `src/proxy.ts` (Next 16's renamed middleware convention) does a fast-path redirect based on the cookie's mere *presence* for `/dashboard` and `/kits`; actual token validity is still enforced by the backend on every request, with `AuthProvider` redirecting to `/login` if a stale cookie gets rejected.

**One backend addition**: `GET /api/kits` (list current user's kits, lean projection, newest-first) didn't exist before this phase — the dashboard has no way to render "recent preparation" without it. Added the smallest version: `kitService.listKits()`, a controller, and a route, following the exact ownership/response conventions already established by the other kit endpoints. Covered by a new integration test.

**Verified**: full flow (register → dashboard empty state → create kit → kit detail → dashboard showing the kit) driven end-to-end in a real headless browser against the real backend + MongoDB, at both desktop (1280px) and mobile (375px) — no console errors, no horizontal overflow, screenshots inspected directly.

**Known limitations**: data fetching is client-side only (no SSR cookie-forwarding yet — a reasonable foundation-phase trade-off, not a correctness issue); the kit detail page is read-only/minimal by design (the full builder/editor is a later phase); no dark mode yet (token architecture supports adding it later without a rewrite).

## Kit Builder & Editing

Lets a user edit a generated kit's company brief, questions, and flashcards, add/delete/reorder/move-category on questions, and reopen the kit later with the same state — without ever silently discarding a hand-written or hand-edited item.

**Content-state model** (`types/kit.types.ts`): every `Question`/`Flashcard` carries `origin: "generated" | "user"` and `edited: boolean`; `CompanyBrief` carries `edited`. Both are always computed **server-side** by diffing the incoming edit against the stored value — never trusted from the client, so they can't be spoofed or missed by a frontend bug. This is the single invariant every later phase (regeneration, practice) builds on: `origin === "user" || edited === true` means "never overwrite this automatically."

**API**: `PATCH /api/kits/:kitId`, body `{ company_brief?, questions?, flashcards? }`. Full-array-replacement semantics for `questions`/`flashcards`: array order in the request becomes the new stored order (this is how reordering and moving a question between categories both work, with no separate "move" operation); an item with an `id` is an edit; an item with no `id` is a new user-owned item, minted a stable id in its own `"u"` namespace so it can never collide with a generated `"q"`/`"f"` id; an existing id simply omitted from the array is a deletion. `requirement_ids` is deliberately not accepted from the client at all — the server always keeps the existing value (or starts a new item at `[]`) — so "no invalid requirement reference" holds by construction, not by extra validation.

**Side effects handled explicitly, not left stale**: `services/kit-update.service.ts` reconciles a deletion against the schedule (strips the stale id from every `schedule.days[].question_ids`, recomputing that day's `minutes`/`focus` with the exact same deterministic helpers Phase 7's scheduler uses) and against coverage (`checkCoverage()` re-run on the new question set) — both reused, never reimplemented. The result is re-validated through the same `draftKitSchema` every other persisted kit must satisfy, then persisted via the same `saveGeneratedDraft()` the generation pipeline already uses.

**Frontend**: `features/kits/builder/` — `KitBuilder` (local editable draft + dirty tracking + explicit "Save changes", never autosave), `CompanyBriefEditor`, `QuestionCategorySection`/`QuestionCard` (edit, ↑/↓ reorder within a category, delete-with-confirm, a category dropdown for moving between categories), `AddQuestionForm`, `FlashcardEditor`, `SaveBar`. Origin/edited render as small tags ("Generated" / "Edited" / "Your question") so generated and user-owned content are visually distinguishable. On a failed save, local edits are kept exactly as-is and an error is shown — nothing is ever silently lost.

**Known limitations**: `requirement_ids` aren't editable from the builder (a new question always starts unlinked; see coverage above) — this was a deliberate scope boundary, not an oversight. No frontend test framework was introduced for this phase; verification was real-browser end-to-end against the live backend instead.

## Safe Regeneration

Lets a user redo the company brief, one question category, or the schedule — without losing unrelated content or any user-owned edit, and without ever replacing the whole kit.

**API**: `POST /api/kits/:kitId/regenerate`, body is a discriminated union: `{ target: "company_brief" }` | `{ target: "schedule" }` | `{ target: "category", category }`. Exactly one section per request.

**Category regeneration** (`services/generation/kit-regeneration.service.ts`) partitions the target category's current questions into `protected` (`origin === "user" || edited === true` — covers hand-written questions, hand-edited ones, *and* a question that was simply moved into this category, since a category move is itself a diffed field that sets `edited: true`) and `replaceable` (`origin === "generated" && !edited`). Only `replaceable` questions are dropped; a fresh batch is generated by calling the exact same per-category generator function (and therefore the exact same prompt/schema) first-pass generation already uses, with fresh ids minted past the highest existing id anywhere in the kit. Every other category, all flashcards, the brief, and the role/requirements are untouched. Coverage and schedule are recomputed from the resulting question set with the same `checkCoverage()`/`createSchedule()` functions generation already uses.

**Company brief regeneration** re-runs research and `generateCompanyBrief()` and fully replaces the brief — there's exactly one brief per kit, so unlike questions there's no sub-item to partially protect; this is a deliberate "redo this whole section" action. **Schedule regeneration** is pure and synchronous — no Gemini call, no research — it just re-derives day placement from whatever question set is currently persisted, so it can never disturb question content or the origin/edited invariant.

**Failure handling is deliberately different from initial generation**: nothing is persisted until the new draft has already passed `validateDraftKit()`, so a failed regeneration (e.g. a Gemini rate limit) leaves the stored kit's content completely untouched and its `generationStatus` stays `"completed"` — unlike first-time generation, a failed regeneration must never knock an already-working kit out of a usable state.

**Frontend**: a `RegenerateButton` (two-step confirm, matching the delete interaction already used elsewhere) next to the Company Brief editor, one per question category section, and one in a small Schedule sub-section of the builder — all three disabled while the builder has unsaved local edits, since regeneration acts on the server's last-*saved* state and would otherwise silently discard local edits the moment its response replaces local state.

## Flashcard Practice Mode

One-card-at-a-time flashcard review with self-reported confidence, prioritising whatever the user is least confident about.

**Data model**: a `confidence: "low" | "medium" | "high" | null` field directly on `Flashcard` (`null` = never practiced = "uncovered"). No separate progress store — practice state lives on the flashcard itself, so deleting a card (Kit Builder) or regenerating anything (regeneration never touches flashcards at all) can never orphan practice progress.

**API**: `PATCH /api/kits/:kitId/flashcards/:flashcardId/practice`, body `{ confidence }`. Deliberately separate from the builder's edit endpoint — recording confidence isn't a content edit, so it never touches `edited`/`origin` and never recomputes coverage or schedule.

**Priority ordering**: a pure, stable sort computed client-side each time practice mode opens — never-practiced first, then low, then medium, high last — so the next session always surfaces whatever needs the most attention. Session position itself isn't persisted (only each card's confidence is), so reloading or restarting always recomputes a fresh, up-to-date order rather than resuming a stale one.

**Frontend**: `features/kits/practice/` — `PracticeMode` (front only → "Reveal Answer" → back + Low/Medium/High → records and advances immediately) at `/kits/:kitId/practice`, plus a live "Uncovered / Low / Medium / High" progress readout and a "Practice again" restart. The builder's flashcard cards also show a confidence tag, so progress is visible outside a practice session too.

## Final Product Integration + Today's Focus

Connects every existing capability into one legible page and adds one small creative feature — no backend changes; this phase is purely presentation over data the API already returns.

**New read-only views** (`features/kits/`): `RoleSummary` (title/seniority/responsibilities/tagged requirements), `CoverageView` (every requirement tagged covered/uncovered, replacing a single terse alert), `ScheduleView` (day-by-day cards resolving `question_ids` to their prompts — the deterministic scheduler itself is untouched). The kit detail page is reordered into an orient → study → act hierarchy: status → Today's Focus → stats → Role & Requirements → Coverage → the editable builder → Schedule → Practice entry point. The dashboard's kit list also surfaces an "N uncovered" tag from data its lean projection already returns.

**Creative feature — Today's Focus** (`features/kits/todays-focus.tsx`): a small card at the top of the kit page that maps elapsed calendar days since the kit's `createdAt` onto the deterministic schedule's day number (clamped to the schedule's range) and shows that day's focus, minutes, and questions, with a jump-link to the full schedule. It's a pure derived computation — no new persistence, no new backend field, can't drift from the real schedule — that directly answers "what should I study today," turning a static generated artifact into a daily, actionable prompt.
