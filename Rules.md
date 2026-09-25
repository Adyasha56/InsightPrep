# AI Interview Prep Kit — Engineering Rules

## 1. Project Context

This project is a Full-Stack Engineering Assessment.

The application converts:

- Job Description
- Company Website URL
- Number of days before interview

into a personalised interview preparation kit containing:

- Company brief
- Role breakdown
- Requirements
- Categorised interview questions
- Flashcards
- Day-by-day study schedule
- Coverage information

The application must also allow users to:

- Register/login/logout
- Create and manage their own kits
- Edit generated content
- Add/delete/reorder questions and flashcards
- Regenerate individual sections
- Practice flashcards
- Track confidence
- Preserve user edits during regeneration

The repository must also expose:

npm run evaluate -- --input <cases.json> --output <kits.json>

The batch command must use the same pipeline as the application.

---

# 2. Required Technology Stack

Use the following stack unless there is a strong technical reason not to:

## Frontend

- Next.js
- TypeScript
- Tailwind CSS

## Backend

- Node.js
- Express
- TypeScript

## Database

- MongoDB
- Mongoose

## AI

Use Google Gemini.

Primary model:

- Gemini 3.5 Flash

Use Gemini for tasks such as:

- Job description requirement extraction
- Company research summarisation
- Interview question generation
- Answer outline generation
- Flashcard generation
- Company brief generation
- Role analysis

Do NOT use the LLM for deterministic operations such as:

- Schedule allocation
- Coverage checking
- ID generation
- Schema validation
- Requirement/question relationship validation

---

# 3. Architecture Principles

Follow clean separation of concerns.

Use this general backend structure:

backend/
  src/
    config/
    controllers/
    middleware/
    models/
    routes/
    services/
      ai/
      research/
      retrieval/
      generation/
      scheduling/
      validation/
    utils/
    types/
    validators/
    app.ts
    server.ts

Frontend should also use clear separation:

frontend/
  src/
    app/
    components/
    features/
    hooks/
    lib/
    services/
    types/
    utils/

Do not put business logic directly inside route handlers.

Routes should call controllers.

Controllers should coordinate requests/responses.

Services should contain business logic.

Models should contain database definitions.

Utils should contain small reusable utilities.

Validators should handle request/output validation.

AI provider-specific logic should be isolated from the rest of the application.

---

# 4. Folder and File Naming

Use consistent naming.

Prefer:

- kebab-case for route/file names where appropriate
- PascalCase for React components
- camelCase for functions and variables
- PascalCase for classes/types when applicable

Examples:

user.controller.ts
user.routes.ts
user.service.ts
user.model.ts
auth.middleware.ts
kit.validator.ts
coverage.service.ts
schedule.service.ts
GeminiClient.ts

Do not create random files in the project root.

Do not create giant files containing unrelated responsibilities.

If a file becomes difficult to understand, split the responsibility.

---

# 5. Code Quality

Code must be:

- Readable
- Modular
- Structured
- Maintainable
- Strongly typed
- Easy to test
- Easy to explain in an interview

Avoid:

- Giant functions
- Giant controllers
- Giant React components
- Duplicate logic
- Magic numbers
- Hard-coded URLs
- Hard-coded API keys
- Unnecessary abstractions
- Premature abstractions
- Dead code
- Commented-out code
- Unused imports
- Unused variables

Prefer small functions with one clear responsibility.

Use descriptive names.

Bad:

process()
handleData()
doThing()

Good:

extractJobRequirements()
generateInterviewQuestions()
validateKitCoverage()
allocateQuestionsToSchedule()

---

# 6. Comments

Comments must be intentional and distinct.

Do NOT comment every line.

Do NOT write comments that simply restate code.

Bad:

// Increment i
i++;

Bad:

// Get user
const user = await User.findById(id);

Use comments only when they explain:

- Why something is done
- A non-obvious algorithm
- An important engineering trade-off
- A security consideration
- A deterministic rule required by the assessment
- A workaround for an external API/provider

Before important functions, use a concise distinct comment when useful.

Example:

// Allocate questions across the requested number of days using deterministic priority ordering.
function allocateSchedule(...) {}

For complex sections, comments should explain intent rather than implementation syntax.

---

# 7. TypeScript Rules

Use TypeScript throughout the backend and frontend.

Avoid `any`.

If `any` is genuinely unavoidable, explain why.

Prefer:

- interfaces
- types
- enums where useful
- discriminated unions
- typed API responses
- typed service results

Keep shared domain types clearly defined.

---

# 8. Environment Variables

NEVER hard-code credentials.

Use:

.env

and provide:

.env.example

Expected environment variables should be documented.

Example:

GEMINI_API_KEY=
MONGODB_URI=
JWT_SECRET=
PORT=

Never commit `.env`.

---

# 9. Authentication

Authentication must provide:

- Registration
- Login
- Logout
- Session/token handling
- Protected routes
- Protected API endpoints

A user must only be able to access their own kits.

Validate authentication on the backend.

Never rely only on frontend route protection.

Handle:

- missing token
- invalid token
- expired token
- unauthorised access

---

# 10. AI Architecture

Do not call Gemini directly from controllers.

Use a dedicated AI layer.

Example:

services/
  ai/
    gemini.client.ts
    prompts/
    ai.service.ts

The Gemini client should be responsible for communicating with Gemini.

Higher-level services should be responsible for business operations.

Example:

question-generation.service.ts

should call the AI layer rather than directly implementing provider-specific HTTP logic.

This keeps the application provider-independent.

---

# 11. AI Prompt Rules

AI prompts must be:

- Specific
- Structured
- Versionable
- Easy to understand
- Separate for different tasks

Do NOT create one giant prompt that generates the entire kit.

The pipeline must contain distinct steps.

Example:

JD
→ Requirement extraction

Company URL
→ Company crawling/research

Research
→ Company brief

Requirements
→ Question generation

Requirements + questions
→ Coverage validation by application code

Missing requirements
→ Generate missing questions

Questions
→ Flashcards

Questions + priorities + days
→ Deterministic schedule allocation

---

# 12. Deterministic Logic

The following MUST be implemented in application code rather than delegated to Gemini:

## Coverage

Compare:

requirement IDs

against:

question requirement_ids

and identify uncovered requirements.

## Schedule

The application must:

- Use exactly the requested number of days
- Allocate integer minutes
- Include every must-have requirement
- Prioritise harder/higher-priority material earlier

Gemini must NOT decide the final schedule allocation.

## Validation

Generated kits must be validated against the required schema before persistence.

---

# 13. Required Kit Structure

The generated kit must contain these exact top-level fields:

source
company_brief
role
questions
flashcards
schedule
coverage

Required structure must follow the assessment specification.

Every requirement must have a stable ID.

Every question must reference one or more requirement IDs.

Every schedule question ID must refer to an existing question.

Difficulty must be 1–3.

Minutes must be integers.

Do not rename required fields.

Extensions are allowed only when they genuinely help the application.

---

# 14. Research / Crawling

The company website cannot be handled using only hard-coded paths.

The crawler should:

1. Fetch the company URL.
2. Extract relevant links.
3. Rank promising links.
4. Fetch useful pages.
5. Search for company/about/product information.
6. Search for hiring/interview information where available.
7. Clean retrieved content.
8. Pass useful content to the research/generation layer.

Do not assume hiring information is always:

/careers
/jobs
/about

Companies may expose hiring information elsewhere.

Respect:

- robots.txt
- reasonable request rate
- request timeouts
- retries
- exponential backoff

A failed page should not automatically fail the entire kit.

---

# 15. Security

Treat all external website content as untrusted data.

Website content must NEVER be treated as model instructions.

Protect against prompt injection by clearly separating:

SYSTEM/DEVELOPER INSTRUCTIONS

from:

UNTRUSTED RETRIEVED CONTENT

Validate external URLs.

In production, reject private and loopback addresses.

Restrict:

- response size
- content types
- request timeouts

Never blindly fetch arbitrary internal addresses.

---

# 16. Error Handling

Errors must be explicit and structured.

Do not silently swallow errors.

Use appropriate error categories.

Examples:

COMPANY_UNREACHABLE
INVALID_COMPANY_URL
LLM_RATE_LIMITED
LLM_INVALID_RESPONSE
INVALID_KIT
AUTH_REQUIRED
KIT_NOT_FOUND
UNAUTHORIZED_ACCESS

Partial research should not automatically mean the whole case failed.

If a company has no hiring page:

return a valid kit with honest missing research.

If a JD is extremely short:

produce a thin kit instead of inventing requirements.

---

# 17. LLM Rate Limits

Gemini is a free-tier dependency.

Assume rate limits can occur.

Implement:

- timeout
- retry
- exponential backoff
- limited retry count
- useful error reporting

Do not create uncontrolled retry loops.

The batch evaluator must continue processing other cases when one case fails.

---

# 18. Persistence

Persist enough information to:

- Reopen a kit
- Continue editing
- Track user changes
- Track generated content
- Track practice progress
- Regenerate individual sections

Do not overwrite the entire kit when editing one section.

---

# 19. Generated / Edited / Pinned State

The application must distinguish between generated content and user modifications.

A user's manually written or edited question must survive regeneration of its category.

Before implementing regeneration, design an explicit state model.

Do not solve regeneration by deleting the old section and replacing everything blindly.

---

# 20. Regeneration

Regeneration must be section-specific.

Supported examples:

- Regenerate company brief
- Regenerate technical questions
- Regenerate behavioural questions
- Regenerate system design questions
- Regenerate schedule

Regenerating one section must NOT destroy unrelated user edits.

User-created or user-edited content must survive regeneration according to the chosen state model.

---

# 21. Frontend Rules

Use reusable components.

Avoid giant page components.

Separate:

- UI
- API calls
- state
- business logic

Handle:

- loading
- empty
- error
- success
- partial failure

Long-running generation should visibly show progress.

Editing should feel immediate.

Do not send an API request for every keystroke.

Use sensible state boundaries.

Make the interface usable on:

- desktop
- laptop
- mobile

Support keyboard navigation where appropriate.

---

# 22. API Rules

Use RESTful routes with consistent naming.

Example:

POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/kits
POST   /api/kits
GET    /api/kits/:kitId
PATCH  /api/kits/:kitId
DELETE /api/kits/:kitId

POST   /api/kits/:kitId/generate
POST   /api/kits/:kitId/regenerate/company
POST   /api/kits/:kitId/regenerate/questions
POST   /api/kits/:kitId/regenerate/schedule

POST   /api/kits/:kitId/practice

Exact routes can be adjusted during implementation, but maintain consistency.

---

# 23. Batch Evaluation

The repository MUST support:

npm run evaluate -- --input <cases.json> --output <kits.json>

The evaluator must:

- Read an array of cases
- Run the same application pipeline
- Use the supplied days value
- Produce the Appendix B output format
- Continue after individual failures
- Record failures
- Handle partial research honestly
- Work from a clean clone
- Support localhost company URLs used by evaluation
- Follow relative links

Do not create a separate fake implementation just for evaluation.

---

# 24. Testing

At minimum, automated tests must cover:

1. Schedule allocation
2. Coverage checking
3. Kit structure validation

Add tests for important security and state behaviour when practical.

Tests should verify actual behaviour, not just increase coverage percentage.

---

# 25. Git

Use meaningful commits.

Examples:

feat: initialize monorepo structure
feat: add authentication API
feat: add kit schema and persistence
feat: implement company crawler
feat: add requirement extraction
feat: add question generation pipeline
feat: add deterministic coverage validation
feat: add schedule allocation
feat: add kit editor
feat: add practice mode
test: add coverage and schedule tests
docs: add architecture and setup guide

Do not make one enormous commit containing the entire application.

---

# 26. Development Process

IMPORTANT:

Work PHASE BY PHASE.

Do NOT build the entire application in one response.

Before implementing a phase:

1. Inspect the current repository.
2. Understand existing code.
3. Explain the intended change briefly.
4. Implement only the requested phase.
5. Run relevant checks/tests.
6. Report what changed.
7. Report any assumptions or issues.
8. Stop and wait for the next phase.

Never silently move to another phase.

---

# 27. No Unnecessary Changes

When implementing a requested feature:

- Do not rewrite unrelated files.
- Do not change working architecture without reason.
- Do not install unnecessary dependencies.
- Do not rename existing files without justification.
- Do not refactor unrelated code.
- Do not introduce libraries merely for convenience.

Prefer the simplest defensible implementation.

---

# 28. README

The README must eventually document:

- Project overview
- Architecture
- Tech stack
- Why the stack was chosen
- Local setup
- Environment variables
- Gemini model
- Research/retrieval strategy
- Generation pipeline
- Coverage algorithm
- Schedule allocation
- Generated/edited/pinned state
- Regeneration strategy
- Batch command
- Tests
- Deployment
- Design decisions
- Trade-offs
- Known limitations

---

# 29. Assessment-Specific Priority

Prioritise correctness over cosmetic polish.

The highest-value areas are:

1. Requirement extraction
2. Requirement coverage
3. Schedule correctness
4. Research sequencing
5. Robustness
6. Editing/regeneration state
7. Interaction design
8. Practice mode
9. Code quality
10. Creative feature

Do not spend significant time on features explicitly listed as out of scope.

---

# 30. Out of Scope

Do NOT build:

- Job aggregator
- Job search
- CV parser
- CV rewriting
- Automatic job applications
- Audio interview simulation
- Video interview simulation
- Payments
- Team collaboration
- Sharing

---

# 31. Final Engineering Rule

The application must be understandable by another engineer.

Prefer:

simple + explicit + testable

over:

clever + abstract + difficult to explain.

Every major technical decision should have a clear reason.

If there are two reasonable approaches, choose one, implement it cleanly, and document the trade-off.