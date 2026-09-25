# InsightPrep

AI-powered interview preparation kits generated from a job description and a company website. See `Rules.md` for the full engineering specification this project follows.

This README is filled in phase by phase; sections not listed here yet will be added as those phases are implemented.

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
