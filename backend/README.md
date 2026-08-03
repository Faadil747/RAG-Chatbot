# Candidate Platform — Backend

Thin orchestration + persistence layer for the AI-Powered Candidate Search
Platform. This service does **no** AI/LLM/parsing work itself — it accepts
resume uploads, forwards them to the `ai-service` (FastAPI, port 8000) for
parsing/search/chat, persists structured results in Postgres via Prisma,
and serves candidate CRUD/listing/filtering to the frontend (port 5173).

## Stack

Node.js + TypeScript + Express, Prisma + PostgreSQL, Multer (local disk
uploads under `uploads/`), Axios (calls to ai-service), Zod (request
validation), CORS, Morgan.

## Prerequisites

- Node.js 20+
- A running PostgreSQL instance
- The `ai-service` running (default `http://localhost:8000`) for any
  endpoint that proxies to it (upload parsing/indexing, search, chat).
  `/api/health`, `GET/DELETE /api/candidates*` work without it.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and adjust as needed:

   ```bash
   cp .env.example .env
   ```

   ```env
   PORT=4000
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/candidate_platform?schema=public
   AI_SERVICE_URL=http://localhost:8000
   UPLOAD_DIR=./uploads
   CORS_ORIGIN=http://localhost:5173
   ```

3. Create the database schema (generates the Prisma client and applies
   migrations, creating the DB if it doesn't exist):

   ```bash
   npx prisma migrate dev
   ```

4. Start the dev server (hot reload via `ts-node-dev`):

   ```bash
   npm run dev
   ```

   The API is now available at `http://localhost:4000/api`. Try:

   ```bash
   curl http://localhost:4000/api/health
   # {"status":"ok"}
   ```

## Scripts

| Script                   | Purpose                                            |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`             | Run with hot reload (`ts-node-dev`)                 |
| `npm run build`           | Compile TypeScript to `dist/`                       |
| `npm start`               | Run the compiled server (`node dist/index.js`)      |
| `npm run prisma:generate` | Regenerate the Prisma client after a schema change   |
| `npm run prisma:migrate`  | Create/apply a dev migration (`prisma migrate dev`) |
| `npm run prisma:deploy`   | Apply pending migrations in a deployed environment  |
| `npm run seed`            | Run the no-op seed stub                             |

## Project layout

```
backend/
  prisma/
    schema.prisma       Candidate / ChatSession / ChatMessage models
    seed.ts              no-op seed stub
  src/
    config/env.ts        typed env var loading
    lib/prisma.ts         shared PrismaClient instance
    lib/aiService.ts      axios client for the ai-service (parse/index/search/chat)
    middleware/upload.ts  multer config (memory storage, 15MB cap, ext allowlist)
    middleware/errorHandler.ts  global error -> { error } JSON mapping
    controllers/          route handlers (candidates, search, chat)
    routes/                Express routers, all mounted under /api
    types/candidate.ts    shared TS shapes matching the ai-service contract
    utils/ApiError.ts     typed HTTP error helper
    utils/asyncHandler.ts  forwards async route rejections to Express
    app.ts                 Express app wiring (cors/morgan/json/routes)
    index.ts                boot: ensure uploads/ exists, listen
  uploads/                raw resume files, named `${candidateId}${ext}`
  Dockerfile              multi-stage node:20-alpine build
```

## API surface

All endpoints are mounted under `/api` and return JSON.

- `GET /api/health` → `{ status: 'ok' }`
- `POST /api/candidates/upload` — multipart, field `files` (multiple).
  Parses each file via ai-service, persists to Postgres, saves the raw
  file to `uploads/`, best-effort indexes it in the ai-service vector
  index. Returns per-file `{ fileName, status, candidateId | error }`.
- `GET /api/candidates` — filterable/paginated list. Query params:
  `search, skills, experienceMin, experienceMax, location, designation,
  availability, page, pageSize`.
- `GET /api/candidates/:id` — full candidate record.
- `GET /api/candidates/:id/resume` — downloads the original resume file.
- `DELETE /api/candidates/:id` — deletes DB row, disk file, and
  best-effort removes it from the ai-service index.
- `POST /api/search` — `{ query }` → proxies to ai-service `/ai/search`.
- `POST /api/search/analysis` — `{ query, candidateId }` → proxies to
  ai-service `/ai/search/analysis`.
- `POST /api/chat` — `{ sessionId, message }` → proxies to ai-service
  `/ai/chat`, then persists the session + both messages.
- `GET /api/chat/:sessionId/history` — chat history from Postgres, ordered
  oldest-first.

## Notes / implementation choices

- **Skills filtering** (`GET /api/candidates?skills=...`) is implemented
  as a native Postgres JSON path filter (`array_contains` across
  `skills.primary` / `skills.secondary`), combined at the DB level with
  every other filter so pagination/count stay correct. This is an
  exact-value match (case-sensitive), not a substring match — the
  documented tradeoff of doing this in the DB instead of pulling every row
  into memory for a case-insensitive scan.
- **Chat history persistence** (`POST /api/chat`) is best-effort relative
  to the response: if the ai-service call succeeds but the follow-up
  Postgres writes fail, the reply is still returned to the caller and the
  failure is logged, rather than turning an already-delivered answer into
  a 5xx.
- **Chat history replay** (`GET /api/chat/:sessionId/history`) returns
  `candidates: []` per message by design — only `candidateIds` are
  persisted, and re-hydrating full `CandidateSummary` objects for every
  historical message would mean extra DB round trips for a read-only
  scrollback view. Fetch `GET /api/candidates/:id` per id if full
  candidate data is needed for a past message.
- **Resume file lookup** (`GET /api/candidates/:id/resume`, delete) probes
  `${id}.pdf`, `${id}.doc`, `${id}.docx` directly rather than scanning the
  uploads directory, since the upload extension allowlist is fixed.
- Multer 2.x is used instead of the 1.x line referenced loosely by "use
  multer" in the spec — 1.x has known unpatched advisories; 2.x is a
  drop-in replacement for the memoryStorage/fileFilter/limits API used
  here.

## Docker

```bash
docker build -t candidate-platform-backend .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/candidate_platform?schema=public \
  -e AI_SERVICE_URL=http://host.docker.internal:8000 \
  -e CORS_ORIGIN=http://localhost:5173 \
  -v candidate_uploads:/app/uploads \
  candidate-platform-backend
```

Run `npx prisma migrate deploy` against the target database before (or as
part of) your deploy — the image does not run migrations automatically.
