# AI-Powered Candidate Search Platform

A premium, AI-first recruiter tool — Home, Add Candidates, Jobs, Candidate List, Candidate Search, Analytics, and an AI Recruitment Chatbot — built around automatic resume parsing, job-fit scoring against recruiter-defined requirements, semantic candidate search with explainable ranking, a RAG-grounded conversational assistant that never answers outside the uploaded candidate database (and can answer aggregate/statistical questions over the whole pool, not just single-query search), and a live analytics dashboard.

This document explains, in depth, **how the whole system actually works**: the services, the data model, the resume-parsing pipeline, every AI agent and its prompt, the RAG/retrieval design, the LLM provider chain and keys, the deterministic ranking algorithm, the full API surface, the database schema, and how to run it.

---

## Table of Contents

1. [High-level architecture](#1-high-level-architecture)
2. [Technology stack](#2-technology-stack)
3. [Repository layout](#3-repository-layout)
4. [The Candidate data model](#4-the-candidate-data-model)
5. [Resume parsing pipeline](#5-resume-parsing-pipeline)
6. [The AI agents](#6-the-ai-agents)
7. [RAG architecture](#7-rag-architecture)
8. [LLM provider chain, models & keys](#8-llm-provider-chain-models--keys)
9. [Semantic search & explainable ranking](#9-semantic-search--explainable-ranking)
10. [Conversational chatbot & memory](#10-conversational-chatbot--memory)
11. [API reference](#11-api-reference)
12. [Database schema (PostgreSQL / Prisma)](#12-database-schema-postgresql--prisma)
13. [Environment variables](#13-environment-variables)
14. [Running the project](#14-running-the-project)
15. [Design decisions & known limitations](#15-design-decisions--known-limitations)
16. [Deployment (Render + Vercel)](#16-deployment-render--vercel)

---

## 1. High-level architecture

Three independent services talk over a fixed JSON contract. The frontend never talks to the AI service directly — everything AI-related is proxied and persisted by the backend.

```mermaid
flowchart LR
    subgraph Browser
        FE["Frontend<br/>React + Vite<br/>:5173"]
    end

    subgraph Backend["Backend — Node/Express :4000/api"]
        API["REST API"]
        PG[("PostgreSQL<br/>Candidates, Chat History")]
    end

    subgraph AIService["AI Service — FastAPI :8000/ai"]
        Agents["Focused agents:<br/>parsing, skills, ranking,<br/>search, recommendation,<br/>reference resolution, analytics"]
        Vec[("Qdrant (local, embedded) +<br/>candidates_store.json")]
        LLM["llm_client.py<br/>(single choke point)"]
    end

    subgraph Providers["LLM Providers"]
        DeepSeek["DeepSeek<br/>(primary in production)"]
        RunPod["RunPod / Ollama<br/>(dev-time alternate)"]
        Groq["Groq<br/>(optional)"]
    end

    FE -- "JSON over HTTP" --> API
    API -- "upload / parse / index / search / chat" --> Agents
    API <-- "candidate rows, chat rows" --> PG
    Agents <--> Vec
    Agents --> LLM
    LLM -- "LLM_PROVIDER (primary)" --> DeepSeek
    LLM -. "LLM_FALLBACK_PROVIDER,<br/>on failure" .-> RunPod
    LLM -. "explicit opt-in" .-> Groq
```

| Service | Role | Owns |
|---|---|---|
| **frontend** | The only UI. Talks exclusively to `backend`. | Nothing persistent — all state lives server-side or in `localStorage` (theme, chat `sessionId`). |
| **backend** | Thin orchestration + persistence layer. Handles file uploads, candidate CRUD/filtering, and proxies all AI work to `ai-service`. Has **no LLM logic of its own**. | PostgreSQL: candidate records, chat history. Local disk: raw resume files (`backend/uploads/`). |
| **ai-service** | The AI brain: resume parsing, structured profile generation, embeddings, vector search, deterministic job-fit ranking, pool-wide analytics, and the RAG chatbot. | Its own lightweight store: `data/candidates_store.json` (full candidate JSON) + `data/qdrant/` (a local, embedded Qdrant vector collection). Kept in sync by the backend calling `/ai/index` after every upload or job reassignment — this means RAG retrieval never needs a round-trip back to Postgres. |

Why two separate candidate stores instead of one shared database? The backend's Postgres is the system of record for the product (CRUD, filters, pagination, chat history — things a relational DB is good at). The ai-service's JSON+Qdrant store is a purpose-built retrieval index (things a vector store is good at). Keeping them separate, connected only by the `/ai/index` write-through call, means each service can be reasoned about, tested, and scaled independently.

---

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 18 + TypeScript + Vite | Fast dev server, strict typing across the whole API contract. |
| Styling / components | Tailwind CSS + a hand-built shadcn-style component library on top of Radix UI primitives (`Dialog`, `Sheet`, `Tabs`, `Select`, `Slider`, `Checkbox`, `Tooltip`, `DropdownMenu`) | Enterprise-SaaS look without a network-dependent CLI generator; Radix gives accessible behavior for free. |
| Animation | Framer Motion | Page transitions, list stagger, sheet/dialog enter animation, skeleton shimmer. |
| Frontend state | Zustand (`themeStore`, `chatStore`, `candidateProfileStore`) | Small, no-boilerplate global state for cross-page concerns (theme, chat session, the shared candidate profile Sheet). |
| Routing | react-router-dom v6 | Client-side routing across all pages, code-split per route via `React.lazy`. |
| Charts | Recharts | Analytics dashboard — light/dark-aware, driven by the app's own HSL design tokens. |
| Backend runtime | Node.js + TypeScript + Express | Simple, well-understood REST layer. |
| ORM / database | Prisma + PostgreSQL | Typed queries, migrations, `Json` columns for nested candidate structure. |
| File uploads | Multer (in-memory, forwarded to ai-service, then written to `uploads/`) | |
| Backend → ai-service calls | Axios (`axios`, `form-data`) | |
| AI service runtime | Python 3.11 + FastAPI + Uvicorn | Async, typed (Pydantic v2), fast to iterate on ML-adjacent code. |
| Resume text extraction | PyMuPDF (primary) → pdfplumber (fallback) for PDF; `python-docx` for DOC/DOCX | |
| OCR (scanned resumes) | pytesseract + pdf2image | Lighter dependency footprint than PaddleOCR (no native build toolchain); swappable, see [§5](#5-resume-parsing-pipeline). |
| Embeddings | `sentence-transformers`, model `nomic-ai/nomic-embed-text-v1.5` (768-dim, task-prefixed: `search_document:`/`search_query:`) | Stronger retrieval quality than a generic small model; runs on CPU. |
| Vector store | Qdrant, local/embedded mode (`QdrantClient(path=...)`, file-based, no server process) | Real vector-DB semantics (upsert-by-id, no manual index rebuild) while staying zero-infra for dev; production runs it on a Render persistent disk, see [Deployment](#16-deployment-render--vercel). |
| LLM SDKs | `openai` SDK (for RunPod/Ollama and DeepSeek, both OpenAI-compatible) + `groq` SDK (for Groq) | One file (`core/llm_client.py`) owns every LLM call — see [§8](#8-llm-provider-chain-models--keys). |
| Embedded dev Postgres | [`pgserver`](https://pypi.org/project/pgserver/) (used only when no Docker/Postgres install is available) | Self-contained Postgres binary controllable from Python — zero-install local dev fallback. |
| Containerization | Docker + `docker-compose.yml` | Postgres + all 3 services wired together for a one-command run. |

---

## 3. Repository layout

```
/
├── frontend/                  React + TS + Tailwind SPA
│   └── src/
│       ├── pages/             Home, Analytics, CandidateCreation, Jobs, CandidateList, CandidateSearch, Chatbot, NotFound
│       ├── components/
│       │   ├── ui/            Hand-built shadcn-style primitives (button, sheet, dialog, table, ...)
│       │   ├── layout/         Sidebar, Header, AppShell, FloatingAssistantButton, ThemeProvider
│       │   ├── candidate/      CandidateProfileSheet, ScoreBadge, SkillBadges, ExperienceTimeline
│       │   ├── chat/           ChatWindow, ChatMessageBubble, ChatSearchResults, ChatInput, CandidateChip
│       │   ├── search/         SearchResultCard, JustificationPanel
│       │   ├── jobs/           CreateJobDialog, JobDetailSheet
│       │   ├── analytics/      StatTile, TopListChart (Recharts)
│       │   └── upload/         DropzoneUploader, UploadPipelineCard
│       ├── store/              zustand stores (theme, chat, candidate profile sheet)
│       ├── hooks/               useChat, useCandidate, useCandidates, useUpload, useJobs, useAnalytics
│       ├── lib/api.ts           Typed fetch wrapper for every backend endpoint
│       └── types/index.ts       The frontend's copy of the shared API contract
│
├── backend/                   Node/Express orchestration + persistence
│   ├── prisma/schema.prisma   Candidate / Job / ChatSession / ChatMessage models
│   └── src/
│       ├── controllers/       candidatesController, jobsController, searchController, chatController, analyticsController
│       ├── routes/             candidates.ts, jobs.ts, search.ts, chat.ts, analytics.ts, health.ts
│       ├── lib/aiService.ts    Axios client for every /ai/* call, with per-call timeouts
│       ├── middleware/         upload.ts (multer), errorHandler.ts
│       └── types/candidate.ts  The backend's copy of the shared API contract
│
├── ai-service/                 Python FastAPI — the AI brain
│   ├── main.py                 App wiring, CORS, startup (loads embedding model + candidate store)
│   ├── core/
│   │   ├── llm_client.py        Single choke point for every LLM call (provider chain, see §8)
│   │   ├── config.py             All env-driven settings
│   │   ├── embeddings.py         Sentence-transformer loading + embedding helpers (Nomic, task-prefixed)
│   │   ├── vector_store.py        Local/embedded Qdrant wrapper
│   │   ├── experience_calc.py     Deterministic experience-years math (never trust the LLM for arithmetic)
│   │   └── parsing/               pdf_parser.py, docx_parser.py, ocr_parser.py, text_extractor.py
│   ├── agents/                  One focused module per agent (see §6), incl. ranking_agent (deterministic job-fit
│   │                             scoring), analytics_agent (pool-wide stats/filters), reference_agent (LLM-backed
│   │                             follow-up resolution for ambiguous chat references)
│   ├── memory/conversation_memory.py   In-memory per-session chat state
│   ├── rag/prompt_builder.py     Assembles the chatbot's + analytics' system/user prompts
│   ├── services/
│   │   ├── candidate_store.py    The service's own JSON+Qdrant "database"
│   │   └── search_pipeline.py    Shared search logic used by /ai/search and the chat's "new search" path
│   ├── routers/                 parse.py, index_.py, search.py, chat.py, jobs.py, analytics.py
│   └── models/                   Pydantic v2 schemas (camelCase on the wire via alias_generator)
│
├── docs/CANDIDATE_SCORING_CRITERIA.md   The published, human-readable job-fit scoring rubric
├── resumes/                    A small demo/seed set of sample PDF resumes for testing
├── docker-compose.yml           Postgres + backend + ai-service + frontend, wired together
└── .env.example                 Root-level compose variables (GROQ/DEEPSEEK keys, model names)
```

---

## 4. The Candidate data model

Every candidate, everywhere in the system (ai-service response, backend persistence, frontend types), is the same shape, in camelCase:

```ts
interface Candidate {
  id: string;                       // uuid, assigned by ai-service at parse time
  fileName: string;                 // original uploaded filename (assigned by backend)
  resumeFileUrl: string;             // "/api/candidates/:id/resume" (assigned by backend)
  uploadedAt: string;                // ISO datetime (assigned by backend)

  // -- extracted verbatim by the Resume Parsing Agent --
  name: string;
  email: string;
  phone: string;
  currentRole: string;
  location: string;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  experience: { company; role; startDate; endDate; durationMonths; description }[];
  education: { institution; degree; field; year }[];
  projects: { name; description; techStack: string[] }[];
  certifications: string[];
  languages: string[];
  previousCompanies: string[];

  // -- derived deterministically or by other agents --
  totalExperienceYears: number;      // deterministic math, see §5
  availability: string;               // regex-inferred from resume text, see §5
  skills: { primary: string[]; secondary: string[] };   // Skill Extraction Agent
  aiSummary: string;                  // Profile Generation Agent
  careerHighlights: string[];
  strengths: string[];
  weaknesses: string[];
  suitableRoles: string[];
  technologyStack: string[];
  overallRating: number;              // 0-100, Profile Generation Agent

  resumeText: string;                 // full raw extracted text, kept for RAG grounding
}
```

A lighter **`CandidateSummary`** projection (`id, name, currentRole, totalExperienceYears, location, topSkills, aiSummary, overallRating, uploadedAt, availability`) is what list views, search cards, and chat candidate-chips actually render — it's built by taking the first 6-8 primary skills as `topSkills` and dropping the heavy fields (`resumeText`, full `experience`/`education`/`projects`).

---

## 5. Resume parsing pipeline

This is what happens, step by step, from the moment a recruiter drops a PDF/DOCX onto the Candidate Creation page to the moment it's searchable.

```mermaid
flowchart TD
    A["Recruiter uploads file(s)"] --> B["Backend: POST /api/candidates/upload<br/>(multer, in-memory)"]
    B --> C["Backend forwards file bytes to<br/>ai-service POST /ai/parse"]
    C --> D{"File type?"}
    D -- ".pdf" --> E["PyMuPDF extracts text"]
    E --> F{"Text length < 50 chars?"}
    F -- "yes (scanned doc)" --> G["pdf2image rasterizes pages<br/>→ pytesseract OCR each page"]
    F -- "no" --> H
    G --> H["Raw resume text"]
    D -- ".docx / .doc" --> I["python-docx extracts text"] --> H
    H --> J["Resume Parsing Agent (LLM)<br/>→ name, contact, experience, education,<br/>projects, certifications, languages"]
    J --> K["Skill Extraction Agent (LLM)<br/>→ skills.primary / skills.secondary"]
    K --> L["Deterministic experience math<br/>(core/experience_calc.py)<br/>→ totalExperienceYears"]
    L --> M["Regex availability inference<br/>→ availability"]
    M --> N["Profile Generation Agent (LLM)<br/>→ aiSummary, strengths, weaknesses,<br/>suitableRoles, technologyStack, overallRating"]
    N --> O["Assemble full Candidate JSON<br/>(uuid4 id)"]
    O --> P["ai-service returns Candidate to backend"]
    P --> Q["Backend: persist to Postgres<br/>+ save file to uploads/"]
    Q --> R["Backend: POST /ai/index<br/>(embed + Qdrant upsert)"]
    R --> S["Candidate is now searchable"]
```

### Step-by-step detail

1. **Raw text extraction** (`core/parsing/text_extractor.py`)
   - `.pdf` → `PyMuPDF` (`fitz`) first. If direct extraction yields under **50 characters**, the document is treated as scanned/image-only and the OCR path kicks in: `pdf2image` rasterizes each page to an image (200 DPI), then `pytesseract` OCRs each page and the results are joined. If OCR also fails (no `tesseract` binary on the host, or `poppler` missing for `pdf2image`), the failure degrades to an empty string and the endpoint returns a clear `422` rather than crashing — the request never 500s on a bad/unreadable file.
   - `.docx` / `.doc` → `python-docx` extracts all paragraph text directly.
   - Anything else → `UnsupportedFileTypeError` → `400`.
   - *Why not PaddleOCR?* It's a heavier native dependency to build/install. `pytesseract` + `pdf2image` gets the same OCR fallback behavior with a much lighter footprint; `ocr_parser.py` isolates the actual OCR call in one function (`_ocr_image`) so PaddleOCR (or any other engine) is a drop-in swap later without touching the trigger logic in `text_extractor.py`.

2. **Resume Parsing Agent** (`agents/resume_parser_agent.py`) — one LLM call that extracts every *factual* field (name, email, phone, current role, location, links, experience entries, education, projects, certifications, languages, previous companies) as a single JSON object. It is instructed to **never invent** unstated information (empty string/array instead of "N/A" placeholders), and to normalize experience dates to `YYYY-MM` or `YYYY`, using literally `"Present"` for ongoing roles.

   A specific, hard-won rule lives in this prompt: many resumes state a role's length as a *relative* duration ("2 yrs", "18 months") instead of calendar dates. In that case the model is told to leave `startDate`/`endDate` empty (it must not invent dates) but is **required** to still convert the stated duration into an accurate `durationMonths` integer — because that's the only signal available for computing total experience on an undated resume. (See the "never zero out experience" fix below — this is the field that makes it work.)

3. **Skill Extraction Agent** (`agents/skill_extraction_agent.py`) — a second LLM call, given the extracted experience, projects, and the raw text, that classifies skills into `primary` (central to recent roles, used repeatedly, emphasized) vs. `secondary` (mentioned but peripheral — older roles, "familiar with" language, used once). It normalizes synonyms ("ReactJS" → "React", "Node" → "Node.js") and de-duplicates so nothing appears in both lists.

4. **Deterministic experience-years computation** (`core/experience_calc.py`) — **the LLM is never trusted to do this arithmetic.** Instead:
   - Each entry's `startDate`/`endDate` strings are parsed (handling `"Jan 2020"`, `"January 2020"`, `"2020-01"`, `"2020/01"`, `"2020"`, and present-words like `"Present"/"Current"/"Till Date"`) into absolute month indices.
   - Dated intervals are sorted and **merged when overlapping/adjacent**, so two concurrent jobs don't get double-counted.
   - For entries with **no parseable dates at all** (the "2 yrs" case above), the entry's own `durationMonths` (the LLM's conversion of the stated relative duration) is added on top of the merged dated total, since an undated entry can't be checked for overlap against anything.
   - As a last-resort safety net (`find_relative_duration_mentions` / `backfill_missing_durations`), if an entry ends up with *neither* dates *nor* a non-zero `durationMonths` (an occasional LLM instruction-following miss), a regex scan of the raw resume text for duration mentions (`"\d+\s*(years?|yrs?|months?|mos?)"`) backfills it positionally, in the order those mentions appear in the text.
   - Total = `round((dated_months + undated_months) / 12, 1)`.

5. **Availability inference** (`routers/parse.py`) — a small set of regexes over the raw resume text (not an LLM call — this is a cheap, deterministic signal): "immediately available" / "open to work" → `"Immediate"`; "notice period: N weeks/months" → `"Notice period: N week(s)/month(s)"`; "available from X" → `"Available from X"`; otherwise `"Not Specified"`.

6. **Profile Generation Agent** (`agents/profile_generation_agent.py`) — the final LLM call, given everything extracted/computed so far, produces the higher-level recruiter-facing judgement: a 2-4 sentence `aiSummary`, `careerHighlights`, honest `strengths` **and** `weaknesses` (the prompt explicitly forbids overselling a thin resume), `suitableRoles`, `technologyStack`, and an `overallRating` (0-100, calibrated: 0-39 weak/poor fit, 40-59 average, 60-74 solid, 75-89 strong, 90-100 exceptional).

7. **Assembly** — the backend fills in `id` echoing the ai-service's uuid, plus `fileName`, `resumeFileUrl`, `uploadedAt`, writes the raw file to `backend/uploads/{id}.{ext}`, and persists the full record to Postgres.

8. **Indexing** — the backend then calls `POST /ai/index` with the full candidate JSON (plus `jobId`/`jobTitle`/`jobMatchScore` when the candidate is assigned to a job). The ai-service builds an **embedding text** (name + role + summary + all skills + every experience role/company + technology stack + suitable roles), embeds it, and upserts it into the local Qdrant collection — from this point the candidate is retrievable by Search, Chat, and Analytics.

No manual data entry happens anywhere in this pipeline — the recruiter only drags a file in.

---

## 6. The AI agents

Rather than one giant prompt, the platform is split into 8 single-purpose agents. Each is a thin Python module: one (or zero, for the deterministic ones) LLM call with its own tightly-scoped system prompt, living next to that prompt in the same file.

| # | Agent | File | LLM call? | Job |
|---|---|---|---|---|
| 1 | **Resume Parsing Agent** | `agents/resume_parser_agent.py` | Yes | Raw text → structured factual fields (contact info, experience, education, projects, certs, languages). |
| 2 | **Skill Extraction Agent** | `agents/skill_extraction_agent.py` | Yes | Experience + projects + raw text → categorized `primary`/`secondary` skills. |
| 3 | **Profile Generation Agent** | `agents/profile_generation_agent.py` | Yes | Everything so far → `aiSummary`, highlights, strengths/weaknesses, suitable roles, tech stack, `overallRating`. |
| 4 | **Candidate Search Agent** | `agents/search_agent.py` | Yes | Natural-language recruiter query → structured intent (designation, skills, experience range, location, industry, education, availability, keywords). Retrieval planning only — no scoring. |
| 5 | **Ranking Agent** | `agents/ranking_agent.py` | **No — deterministic** | Structured intent + candidate → 7 weighted sub-scores → blended `matchScore`. See [§9](#9-semantic-search--explainable-ranking). |
| 6 | **Chatbot Agent** | `agents/chatbot_agent.py` | Yes | Assembled RAG prompt → `reply` + `suggestions` + `candidateIds`, strictly grounded in retrieved candidate context. |
| 7 | **Recommendation Agent** | `agents/recommendation_agent.py` | Yes | One candidate + a query/focus → a grounded justification (matching skills, relevant experience, strong points, concerns, hire recommendation) or, in "focus" modes, interview questions / a hiring recommendation for chat. |
| 8 | **Validation Agent** | `agents/validation_agent.py` | Sometimes | Gate-keeps the chatbot to the recruiting domain — fast regex heuristics handle the obvious cases; only genuinely ambiguous messages spend an LLM call. |

Two of these are deliberately **not** LLM calls at all, on purpose:

- **Ranking** is pure Python arithmetic (§9) — rankings must be stable, explainable, and cheap to recompute; an LLM would make them slow, expensive, and non-reproducible.
- **Validation** front-loads regex checks (greetings, short follow-ups like "compare top 3", obvious recruiting keywords) and only calls the LLM classifier for genuinely ambiguous input — most turns in a real conversation never need an extra round-trip.

---

## 7. RAG architecture

```
Resume Upload
     │
     ▼
Resume Parser (text extraction + OCR fallback)
     │
     ▼
Structured Candidate JSON  (agents 1-3 + deterministic math)
     │
     ▼
Embedding Generation  (nomic-embed-text-v1.5, 768-dim, task-prefixed)
     │
     ▼
Qdrant Vector Store  (local/embedded, cosine similarity)  ◄── candidates_store.json (full JSON, keyed by id)
     │
     ▼
Retriever  (vector similarity shortlist, conversation-memory resolution for follow-ups,
            or -- for aggregate/statistical questions -- the whole pool via the Analytics Agent)
     │
     ▼
Prompt Builder  (fixed HR-recruiter persona + trimmed candidate context + recent turns,
                 or the Analytics prompt for "how many/average/most common" questions)
     │
     ▼
Chatbot Agent  (LLM, via llm_client.py's provider chain)
     │
     ▼
Final grounded response  (reply + suggestions + candidateIds + candidates + query/results for ranked search turns)
```

**Every chatbot response retrieves relevant candidate data *before* generating an answer** — the model is never asked a question without first being handed the actual records it needs to answer honestly. Concretely:

- **Embedding text** (`core/embeddings.py:build_candidate_embedding_text`) — built from `name + currentRole + aiSummary + skills.primary + skills.secondary + (experience role, company)* + technologyStack + suitableRoles`. This is deliberately richer than just the raw resume text: it foregrounds the *judged* signal (AI summary, categorized skills) alongside the raw facts, which makes semantic similarity searches land on relevance rather than surface keyword overlap.
- **Vector store** (`core/vector_store.py`) — Qdrant in local/embedded mode (`QdrantClient(path=...)`, file-based, no server process), storing 768-dim Nomic vectors. Upsert-by-id is native, so there's no manual index-rebuild dance. In production it runs on a single Render instance with a persistent disk (see [Deployment](#16-deployment-render--vercel)).
- **Retriever**: for a brand-new query ("show me...", "find..."), the query is reformulated (raw query + parsed designation + skills + keywords + industry + location, pipe-joined) and embedded with the `search_query:` prefix, then Qdrant returns a similarity shortlist (top 30), which the deterministic Ranking Agent scores and sorts. For a *follow-up* in an ongoing chat ("compare top 3", "tell me more about the second one", "does she know AWS"), no new vector search happens at all — the retriever resolves candidate ids from **conversation memory** (§10) via fast regex heuristics, falling back to an LLM-backed Reference Resolution Agent for phrasing the heuristics can't confidently parse. For an *aggregate* question ("how many Java developers do we have", "average experience for the DevOps job"), retrieval bypasses ranking entirely and the deterministic Analytics Agent filters/aggregates the **whole** candidate pool instead of a single shortlist.
- **Prompt Builder** (`rag/prompt_builder.py`) — assembles a fixed system prompt (the recruiter-assistant persona and its strict grounding rules) plus a *trimmed* JSON of the retrieved candidates (drops `resumeText`/embedding text — not useful for reasoning, just noise/cost) plus the last 12 conversation turns plus the current message, and asks for a fixed JSON response shape. Aggregate questions instead get a dedicated prompt built purely from Python-computed statistics, with the model explicitly instructed to phrase them, never recompute them.
- **Grounding enforcement** happens at multiple layers, not just "please don't hallucinate" in the prompt: the Validation Agent gates the domain before any retrieval happens at all; the Prompt Builder physically limits what data the model can see to only the retrieved candidates (or the exact computed numbers, for analytics); and the Recommendation Agent (used for justifications/interview questions/hiring recommendations) is explicitly instructed to state honest concerns rather than paper over a weak match.

---

## 8. LLM provider chain, models & keys

All LLM calls in the entire ai-service go through **exactly one file**: `ai-service/core/llm_client.py`. No agent, router, or other module imports `openai` or `groq` directly. This is a deliberate architectural constraint from the original spec ("keep the architecture modular so [the LLM] can later be replaced without changing the application") — and it's what made it possible to add two more providers after the fact without touching a single agent.

### Provider chain

```mermaid
flowchart LR
    A["Agent calls chat_json(system, user)"] --> B{"Try primary provider<br/>(LLM_PROVIDER)"}
    B -- "success" --> F["Return parsed JSON"]
    B -- "exception<br/>(timeout / connection error / non-2xx)" --> C{"Try fallback provider<br/>(LLM_FALLBACK_PROVIDER)"}
    C -- "success" --> F
    C -- "exception" --> D["Raise — caller's endpoint<br/>returns a clean 502"]
```

`chat_json()` (the function every agent calls) tries the **primary** provider; if that call raises *for any reason* (network error, timeout, non-2xx, unknown model), it logs a warning and retries **once**, automatically, against the **fallback** provider — fully transparent to the calling agent. Separately, if a provider *does* respond but the response isn't valid JSON, `chat_json` retries the *same* provider once more with a sterner "respond with ONLY JSON" instruction before giving up.

### The three providers

| Provider | SDK used | Base URL | Default model | Notes |
|---|---|---|---|---|
| **`runpod`** (default primary) | `openai` (OpenAI-compatible client, different `base_url`) | `RUNPOD_BASE_URL` — a self-hosted [Ollama](https://ollama.com) instance reached through a RunPod proxy, at Ollama's OpenAI-compatible `/v1` routes | `qwen2.5:14b` | Ollama doesn't check the API key at all, but the OpenAI SDK requires a non-empty string, so a placeholder (`"ollama"`) is sent. `qwen2.5:14b` is 14B parameters and tools-capable — noticeably more reliable at instruction-following (e.g. the "convert '2 yrs' into durationMonths" rule in §5) than the smaller model this project fell back to during development. |
| **`deepseek`** (default fallback) | `openai` (OpenAI-compatible client) | `https://api.deepseek.com` | `deepseek-v4-flash` | DeepSeek's `/chat/completions` is OpenAI-compatible, including `response_format={"type":"json_object"}` JSON mode. **The exact model name your key accepts is account-specific** — if the API responds with a 400 naming the models it actually supports, use one of those names as `DEEPSEEK_MODEL`. |
| **`groq`** (available, opt-in) | `groq` (official SDK) | Groq's default endpoint | `llama-3.3-70b-versatile` | Kept as a third option; select it by setting `LLM_PROVIDER=groq` (and/or `LLM_FALLBACK_PROVIDER=groq`). |

Both `runpod` and `deepseek` are called through the exact same `openai.OpenAI` client class (just pointed at different `base_url`s) — because Ollama's `/v1` routes and DeepSeek's API are both OpenAI-compatible, the calling code (`_completion_content` in `llm_client.py`) is 100% provider-agnostic: it always calls `client.chat.completions.create(...)` with the same shape.

### Where the keys live

Every key lives in **`ai-service/.env`**, which is git-ignored — none of them are committed. `ai-service/.env.example` documents every variable with no real secrets:

```dotenv
# Primary + fallback provider selection
LLM_PROVIDER=runpod
LLM_FALLBACK_PROVIDER=deepseek

# RunPod / Ollama (primary)
RUNPOD_BASE_URL=https://your-runpod-proxy-host/v1
RUNPOD_MODEL=qwen2.5:14b
RUNPOD_API_KEY=ollama          # placeholder — Ollama ignores this

# DeepSeek (fallback)
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat   # or whatever your key's 400 error tells you to use
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Groq (optional third provider)
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Embeddings (local, no key needed — runs on CPU via sentence-transformers)
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
```

To swap providers entirely (say, to self-host everything and drop DeepSeek), only `LLM_PROVIDER`/`LLM_FALLBACK_PROVIDER` and the corresponding `*_BASE_URL`/`*_MODEL`/`*_API_KEY` vars need to change — zero code changes anywhere else in the service.

### JSON-mode & parsing safety net

Every agent call requests `response_format={"type": "json_object"}`, constraining the model to emit valid JSON. `llm_client._extract_json()` is still defensive on top of that: it strips stray markdown code fences (` ```json ... ``` `) if a model adds them anyway, and falls back to grabbing the widest `{...}` span in the response if the fence-stripped text still doesn't parse outright.

---

## 9. Semantic search & explainable ranking

The Candidate Search page (and the chatbot's "new search" path) both go through the same pipeline (`services/search_pipeline.py`):

```mermaid
flowchart TD
    A["Recruiter query, e.g.<br/>'Python developers with 5 years experience in Chennai'"] --> B["Candidate Search Agent (LLM)<br/>→ structured intent"]
    B --> C["Reformulate: raw query + designation<br/>+ skills + keywords + industry + location"]
    C --> D["Embed reformulated query"]
    D --> E["Qdrant similarity search<br/>→ shortlist of 30 candidates"]
    E --> F["Ranking Agent (deterministic)<br/>→ 7 sub-scores → weighted matchScore<br/>→ sort, take top 10"]
    F --> G["Recommendation Agent (LLM)<br/>for ranks 1-3 only"]
    G --> H["SearchResponse:<br/>rank, matchScore, breakdown,<br/>candidate summary, justification"]
```

### 1. Intent parsing (Candidate Search Agent)

The query is never matched on exact keywords. An LLM call extracts structured intent — `designation`, `requiredSkills`, `minExperience`/`maxExperience`, `location`, `industry`, `education`, `availability`, `keywords` — with explicit rules for translating vague language into numbers: `"5+ years"` → `minExperience=5`; `"3-5 years"` → `min=3, max=5`; `"junior"/"entry level"` → `maxExperience≈2`; `"senior"` → `minExperience≈5`; `"lead"/"principal"` → `minExperience≈8`.

### 2. Retrieval

The raw query plus every piece of parsed intent is joined into one reformulated string and embedded, then Qdrant returns the 30 nearest candidates by cosine similarity — a shortlist, not the final ranking.

### 3. Explainable, deterministic ranking (`agents/ranking_agent.py`)

This is plain Python, not an LLM call — rankings need to be fast, cheap, stable, and auditable. Each candidate in the shortlist gets 7 sub-scores (0-100 each):

| Sub-score | How it's computed |
|---|---|
| `skillMatch` | Overlap of parsed `requiredSkills` against the candidate's `skills.primary` + `skills.secondary` (exact match, or partial/substring credit — e.g. "react" credits "reactjs"). |
| `experienceMatch` | How close `totalExperienceYears` is to the parsed `[min, max]` range — 100 if inside the range, decaying 15 points per year outside it. |
| `designationMatch` | Fuzzy string similarity (`difflib.SequenceMatcher`) between the parsed designation and the candidate's `currentRole`/`suitableRoles`, boosted if one is a substring of the other. |
| `industryMatch` | Keyword overlap between the parsed industry/keywords and the candidate's `previousCompanies` + experience descriptions. |
| `educationMatch` | Keyword overlap between the parsed education requirement and the candidate's degree/field/institution text. |
| `technologyMatch` | Overlap of required skills + keywords against the candidate's `technologyStack`. |
| `freshnessScore` | Tiered by how recently the candidate was uploaded — see below. |

Any dimension the query doesn't actually constrain (e.g. no education mentioned) scores a **neutral 50**, rather than 0 or 100, so it doesn't wrongly reward or punish candidates on a criterion the recruiter never asked about.

**Freshness tiers** (per the original spec's priority order):

| Days since upload | `freshnessScore` |
|---|---|
| ≤ 30 | 100 |
| 31–60 | 75 |
| 61–90 | 50 |
| 90+ | 25 |

**Blending** — a fixed weighted average, with named constants in the code so the weighting is transparent and testable:

| Sub-score | Weight |
|---|---|
| `skillMatch` | 0.22 |
| `designationMatch` | 0.18 |
| `technologyMatch` | 0.18 |
| `experienceMatch` | 0.15 |
| `industryMatch` | 0.12 |
| `educationMatch` | 0.10 |
| `freshnessScore` | 0.05 |

(Weights sum to 1.0. Skill/technology/designation match are weighted highest since they're the strongest fit signals; freshness is weighted lowest since it's a tiebreaker, not a qualification.)

The shortlist is sorted by this blended `matchScore` and the top 10 become the response.

### 4. Auto-justification for the top 3 (Recommendation Agent)

To control LLM cost, only ranks **1-3** get an automatic, grounded justification (`matchingSkills`, `relevantExperience`, `strongPoints`, `potentialConcerns`, `recommendation`) generated inline as part of the search response. Ranks 4-10 get `justification: null`, and the frontend shows a **"Generate AI Analysis"** button that calls `POST /api/search/analysis` on demand for any of them — the same Recommendation Agent, just deferred until a recruiter actually wants it.

---

## 10. Conversational chatbot & memory

The chatbot (`routers/chat.py`) is the most stateful part of the AI service. Per session (`memory/conversation_memory.py`, an in-memory, module-level dict — deliberately not persisted to disk, since durable history is the backend's job):

- **`messages`** — the last 20 turns.
- **`last_search_query`** / **`last_search_results`** — the most recent search's query and result summaries, in rank order.
- **`last_candidates_discussed`** — every candidate id mentioned so far, most-recent-first, deduplicated.
- **`last_comparison`** — the candidate ids in the most recent comparison.

### Turn-by-turn pipeline

1. **Validation Agent** gates the domain first. Fast regex checks handle: greetings ("hi", "thanks"); short follow-ups ("compare top 3", "generate interview questions", "him"/"her"/"them"); and obviously recruiting-flavored language (any of ~25 keywords like "candidate", "resume", "hire", "notice period", "engineer", ...). A short message (≤4 words) inside an ongoing conversation is also treated as in-domain by default (very likely a follow-up). Only genuinely ambiguous messages spend an LLM classification call. If the message is out of domain, the chatbot replies with exactly:

   > *"I can only answer questions related to the uploaded candidate database."*

   — and the pipeline stops there; no retrieval, no LLM chat call.

2. **Retrieval.** If the message *looks like* a new search (starts with "show", "find", "search", "who are", "give me", ...), the full search pipeline from §9 runs fresh, and its results become the new `last_search_results`. Otherwise, `resolve_referenced_candidates()` figures out who the recruiter means from memory alone:
   - `"compare"` / `"top N"` / `"all of them"` → the first N ids from the last search's rank order (default 3).
   - Ordinal words ("the second one", "first candidate") → indexed into the last search's result order.
   - Pronouns ("this", "that", "him", "her", "them") → the single most-recently-discussed candidate.
   - A candidate's name appearing literally in the message → that candidate.

   **The recruiter never has to repeat a candidate's name** — this resolution is what makes "compare top 3" → "yes" → "generate interview questions" work as a natural conversation.

3. **Interview questions / hiring recommendation** requests are detected by regex and routed straight to the **Recommendation Agent** (not the general Chatbot Agent) with a `focus` flag, so those specific asks are grounded in real candidate data rather than freely generated.

4. Otherwise, the **Prompt Builder** assembles the system persona + trimmed candidate context + recent turns, and the **Chatbot Agent** produces the final `reply` + 2-4 proactive `suggestions` (clickable quick-replies guiding the recruiter to a natural next step — "Compare Top 3", "Generate hiring recommendation?", etc.) + `candidateIds`.

5. Memory is updated with this turn, and the backend separately persists both the user message and the assistant's reply to Postgres (`ChatMessage` rows) for history replay across page reloads — the ai-service's in-memory state only needs to survive within the current process's uptime, not across restarts.

### Example conversation (verified working end-to-end)

```
Recruiter: Show me the best Python developers
Assistant: [ranks 4 real candidates by matchScore, summarizes top matches,
            suggests "Compare Sneha vs Varun", "Get interview questions", ...]

Recruiter: Compare top 3
Assistant: [resolves the top 3 ids from memory, no names repeated,
            produces a grounded comparison — and, correctly, flags when a
            candidate mentioned earlier isn't actually in that top-3 slice]

Recruiter: Who won the IPL this year?
Assistant: "I can only answer questions related to the uploaded candidate database."
```

---

## 11. API reference

### Backend (`http://localhost:4000/api`) — called by the frontend

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/candidates/upload` | multipart `files` (multiple) | `{ results: [{ fileName, status: 'success'\|'error', candidateId?, error? }] }` — each file processed independently, one failure doesn't kill the batch |
| `GET` | `/candidates` | `?search=&skills=&experienceMin=&experienceMax=&location=&designation=&availability=&page=&pageSize=` | `{ candidates: CandidateSummary[], total, page, pageSize }` |
| `GET` | `/candidates/:id` | — | Full `Candidate` |
| `GET` | `/candidates/:id/resume` | — | Resume file download |
| `DELETE` | `/candidates/:id` | — | `{ success: true }` — removes the DB row, the file, and best-effort the Qdrant entry |
| `POST` | `/search` | `{ query }` | `{ query, totalMatches, results: SearchResult[] }` |
| `POST` | `/search/analysis` | `{ query, candidateId }` | `Justification` (on-demand, for ranks 4-10) |
| `POST` | `/chat` | `{ sessionId, message }` | `{ sessionId, reply, suggestions, candidateIds, candidates }` |
| `GET` | `/chat/:sessionId/history` | — | `{ sessionId, messages: [{ role, content, createdAt, suggestions, candidateIds }] }` |
| `GET` | `/health` | — | `{ status: "ok" }` |

### AI service (`http://localhost:8000/ai`) — called only by the backend, never by the browser

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/parse` | multipart `file` | Full `Candidate` JSON (no `fileName`/`resumeFileUrl`/`uploadedAt` — the backend fills those in) |
| `POST` | `/index` | Full candidate JSON (+ optional `uploadedAt`) | `{ indexed: true, candidateId }` |
| `DELETE` | `/index/:candidateId` | — | `{ removed: boolean }` |
| `POST` | `/search` | `{ query, topK }` | `{ query, totalMatches, results: SearchResult[] }` |
| `POST` | `/search/analysis` | `{ query, candidateId }` | `Justification` |
| `POST` | `/chat` | `{ sessionId, message }` | `{ sessionId, reply, suggestions, candidateIds, candidates }` |
| `GET` | `/health` | — | `{ status, candidatesIndexed }` |

### Shared response shapes

```ts
interface SearchResult {
  candidateId: string;
  rank: number;
  matchScore: number;              // 0-100, weighted blend — see §9
  breakdown: {                     // the 7 sub-scores that produced matchScore
    skillMatch: number; experienceMatch: number; designationMatch: number;
    industryMatch: number; educationMatch: number; technologyMatch: number;
    freshnessScore: number;
  };
  candidate: CandidateSummary;
  justification: Justification | null;   // pre-filled for ranks 1-3, null otherwise
}

interface Justification {
  matchingSkills: string[];
  relevantExperience: string;
  strongPoints: string[];
  potentialConcerns: string[];
  recommendation: string;          // e.g. "Strong Hire — ..."
}
```

---

## 12. Database schema (PostgreSQL / Prisma)

```prisma
model Candidate {
  id            String   @id @default(uuid())
  fileName      String
  resumeFileUrl String
  uploadedAt    DateTime @default(now())

  name        String
  email       String
  phone       String
  currentRole String
  location    String
  linkedin    String?
  github      String?
  portfolio   String?

  totalExperienceYears Float
  availability         String @default("Not Specified")
  overallRating        Float

  skills            Json   // { primary: string[]; secondary: string[] }
  experience        Json   // Experience[]
  education         Json   // Education[]
  projects          Json   // Project[]
  certifications    Json   // string[]
  languages         Json   // string[]
  previousCompanies Json   // string[]

  aiSummary        String @db.Text
  careerHighlights Json
  strengths        Json
  weaknesses       Json
  suitableRoles    Json
  technologyStack  Json

  resumeText String @db.Text

  @@index([uploadedAt])
  @@index([location])
  @@index([currentRole])
  @@index([availability])
  @@index([totalExperienceYears])
}

model ChatSession {
  id        String        @id
  createdAt DateTime      @default(now())
  messages  ChatMessage[]
}

model ChatMessage {
  id           String      @id @default(uuid())
  sessionId    String
  session      ChatSession @relation(fields: [sessionId], references: [id])
  role         String      // "user" | "assistant"
  content      String      @db.Text
  suggestions  Json?
  candidateIds Json?
  createdAt    DateTime    @default(now())

  @@index([sessionId])
}
```

Scalar columns are used for anything the Candidate List page filters/sorts on directly (`location`, `currentRole`, `availability`, `totalExperienceYears`, `uploadedAt`); everything nested (skills, experience, education, projects, the AI-judged fields) is a Prisma `Json` column, filtered in-application where Postgres's native JSON operators aren't a clean fit.

---

## 13. Environment variables

### `ai-service/.env`

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | |
| `LLM_PROVIDER` | `runpod` | Primary LLM provider — `runpod`, `deepseek`, or `groq` |
| `LLM_FALLBACK_PROVIDER` | `deepseek` | Provider retried once if the primary call fails |
| `RUNPOD_BASE_URL` | — | Your Ollama-via-RunPod OpenAI-compatible `/v1` endpoint |
| `RUNPOD_MODEL` | `qwen2.5:14b` | Model name as reported by `GET {base}/models` on your instance |
| `RUNPOD_API_KEY` | `ollama` | Placeholder — Ollama doesn't check it |
| `DEEPSEEK_API_KEY` | — | **Required** if DeepSeek is primary or fallback |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Account-specific — see §8 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | |
| `GROQ_API_KEY` | — | Required only if `LLM_PROVIDER`/`LLM_FALLBACK_PROVIDER` is `groq` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | |
| `EMBEDDING_MODEL` | `nomic-ai/nomic-embed-text-v1.5` | Runs locally on CPU, no key needed |
| `DATA_DIR` | `./data` | Where `faiss.index` / `vector_ids.json` / `candidates_store.json` live |
| `CORS_ORIGIN` | `http://localhost:4000` | Only the backend calls this service, so this is the backend's origin |

### `backend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/candidate_platform?schema=public` | |
| `AI_SERVICE_URL` | `http://localhost:8000` | |
| `UPLOAD_DIR` | `./uploads` | |
| `CORS_ORIGIN` | `http://localhost:5173` | The frontend's origin |

### `frontend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | |

### Root `.env` (docker-compose only)

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL`, `EMBEDDING_MODEL` | Passed through into the `ai-service` container |

All `.env` files are git-ignored; only `.env.example` files (no real secrets) are committed.

---

## 14. Running the project

### Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env — set whichever LLM provider keys you're using
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000/api (health: `/api/health`)
- AI service: http://localhost:8000/ai (health: `/ai/health`, interactive docs: `/docs`)
- Postgres: `localhost:5432` (`postgres`/`postgres`/`candidate_platform`)

The backend container runs `npx prisma migrate deploy` on boot, applying the schema automatically.

### Manual (no Docker)

```bash
# 1. ai-service
cd ai-service
python -m venv .venv && .venv\Scripts\activate      # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env      # set your LLM provider keys
uvicorn main:app --reload --port 8000

# 2. backend (needs a Postgres instance reachable at DATABASE_URL)
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev

# 3. frontend
cd frontend
npm install
cp .env.example .env
npm run dev
```

No local Postgres and no Docker? The [`pgserver`](https://pypi.org/project/pgserver/) PyPI package ships a self-contained Postgres binary controllable from a few lines of Python — `pgserver.get_server(data_dir)` starts a real Postgres listening on a local TCP port with zero installer, which is exactly how this project was smoke-tested in a sandboxed environment with neither Docker nor a system Postgres available.

### Trying it out

`resumes/` at the repo root ships a small demo/seed set of sample PDF resumes — drag a handful onto Add Candidates, then:

1. Check they land in Candidate List with correctly parsed experience/skills/rating.
2. Try a natural-language query on Candidate Search, e.g. *"Python developers with 5 years experience"*.
3. Open the AI Chatbot: *"Show me the best candidates for a backend role"* → *"compare top 3"* (no names needed) → *"generate interview questions for them"*.
4. Ask something unrelated ("who won the IPL?") and confirm the refusal.

---

## 15. Design decisions & known limitations

- **Vector store**: Qdrant in local/embedded mode (`QdrantClient(path=...)`, file-based, single-process file lock, no server) — correct and simple, and genuinely capable (native upsert-by-id, real similarity search), but tied to one process's local disk. That's why the Render deployment (§16) pins ai-service to a single instance with a persistent disk rather than autoscaling it — a multi-instance deployment would need a real hosted Qdrant (or a rewrite onto pgvector) instead.
- **Two candidate stores, one write path**: Postgres (backend, system of record) and the ai-service's JSON+Qdrant store (retrieval index) are kept in sync purely by the backend calling `/ai/index` after every upload/reassignment/delete. There is no reverse sync — if the ai-service's store is ever wiped, re-running `/ai/index` for every existing Postgres candidate would rebuild it (not currently automated).
- **OCR**: `pytesseract` + `pdf2image` rather than PaddleOCR, for a lighter dependency footprint (no native build toolchain). Requires the `tesseract` binary (and `poppler` for `pdf2image`) on the host — the provided `Dockerfile` installs both.
- **LLM instruction-following varies by model.** During development, a smaller/faster model occasionally left `durationMonths` at 0 for undated experience entries despite explicit prompt instructions — this is why §5's experience computation has a deterministic regex backfill on top of the LLM's own extraction, and why a 14B tools-capable model (`qwen2.5:14b`) is the default primary provider. Never trust a single LLM call, unchecked, for anything that has a deterministic ground truth.
- **Redis**: listed in the original spec as optional for chat session caching, intentionally not implemented — chat *reasoning* state lives in-process in the ai-service (fine for single-process dev), while durable chat *history* is persisted in Postgres by the backend.
- **No authentication**: single-recruiter internal tool per spec — no login/auth screens anywhere in the stack. If this is ever deployed somewhere it's reachable by more than trusted users, put it behind a gate (a reverse-proxy basic-auth rule, a VPN, or a real login screen) — the app itself does not check who's asking.

---

## 16. Deployment (Render + Vercel)

Three deploys, in this order: **Render Postgres → Render ai-service → Render backend → Vercel frontend**, then one loop back to fix a circular CORS dependency. Uses DeepSeek as the only LLM provider in production — the `RunPod`/`Groq` providers in §8 are dev-time alternates, not required.

### 16.1 Render — PostgreSQL

1. Render Dashboard → **New → PostgreSQL**. Name it (e.g. `rag-chatbot-db`), pick a region close to where the other two services will run.
2. Note the **Internal Database URL** (used by the backend service, same-region traffic, no egress cost) and the **External Database URL** (only needed if you ever run `prisma migrate deploy` from your own machine instead of at deploy time).

### 16.2 Render — ai-service (Python/FastAPI)

1. **New → Web Service** → connect this repo → **Root Directory**: `ai-service`.
2. **Environment**: Docker (the existing `ai-service/Dockerfile` is already deploy-ready — installs `tesseract-ocr`/`poppler-utils` for OCR fallback, installs `requirements.txt`, runs `uvicorn main:app --host 0.0.0.0 --port 8000`).
3. **Add a Persistent Disk**, mount path `/app/data`, start at 1GB and grow as the candidate pool grows. This holds the local Qdrant collection + `candidates_store.json` — without it, every deploy/restart wipes all indexed candidates (Render's default filesystem is ephemeral). Keep this service at **exactly one instance** — no autoscaling, no zero-downtime rolling deploys — the local Qdrant file lock isn't safe to share across replicas.
4. **Environment variables**:
   ```
   PORT=8000
   LLM_PROVIDER=deepseek
   LLM_FALLBACK_PROVIDER=deepseek
   DEEPSEEK_API_KEY=<your real DeepSeek key>
   DEEPSEEK_MODEL=deepseek-v4-flash
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   LLM_REQUEST_TIMEOUT=40
   EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
   DATA_DIR=/app/data
   CORS_ORIGIN=<filled in after step 16.3 — the backend's Render URL>
   ```
   Leave `RUNPOD_*`/`GROQ_*` unset entirely. `core/config.py`'s `Settings.llm_provider` default is still `"runpod"` (a dev-time default, intentionally not changed since local dev still wants RunPod-primary) — the env var above overrides it, but if this service ever starts up giving 404s from a RunPod URL, the first thing to check is whether `LLM_PROVIDER=deepseek` actually got set.
5. **Health check path**: `/ai/health`.
6. Deploy. The first boot is slow — it downloads the Nomic embedding model. Watch the logs for `"AI service ready. N candidates indexed."` before moving on.
7. Copy this service's Render URL (e.g. `https://rag-chatbot-ai.onrender.com`) — the backend needs it next.

### 16.3 Render — backend (Node/Express)

1. **New → Web Service** → this repo → **Root Directory**: `backend`.
2. **Environment**: Docker (`backend/Dockerfile` is already deploy-ready — multi-stage build, `prisma generate`, `VOLUME /app/uploads`).
3. **Add a Persistent Disk**, mount path `/app/uploads` — original resume files live here and are served back via `GET /api/candidates/:id/resume`; without a persistent disk they vanish on every restart.
4. **Environment variables**:
   ```
   PORT=4000
   DATABASE_URL=<Render Postgres Internal Database URL, from §16.1>
   AI_SERVICE_URL=<ai-service's Render URL, from §16.2>
   UPLOAD_DIR=/app/uploads
   CORS_ORIGIN=http://localhost:5173
   ```
   (`CORS_ORIGIN` is a placeholder for now — it's set for real in step 16.5, after the Vercel URL exists. `CORS_ORIGIN` accepts a comma-separated list and a `*` wildcard segment, e.g. `https://your-app.vercel.app,https://*.vercel.app`, so every Vercel preview deploy is covered alongside the production domain.)
5. **Start command**: override it to run pending migrations before boot —
   ```
   sh -c "npx prisma migrate deploy && node dist/index.js"
   ```
6. **Health check path**: `/api/health`.
7. Now go back to step 16.2 and set that service's `CORS_ORIGIN` to *this* service's Render URL (ai-service only ever needs to allow the backend's origin — the frontend never calls ai-service directly, only through the backend).
8. Deploy. Confirm the logs show Express listening with no Prisma connection errors, and copy this service's Render URL — the frontend needs it next.

### 16.4 Vercel — frontend

1. **New Project** → import this repo → **Root Directory**: `frontend`.
2. Framework preset: **Vite**. Build command: `npm run build` (runs `tsc -b && vite build`). Output directory: `dist`.
3. **Environment variable**:
   ```
   VITE_API_BASE_URL=<backend's Render URL, from §16.3>/api
   ```
4. Deploy. Copy the production URL Vercel assigns.

### 16.5 Close the CORS loop

Go back to the **backend** service (§16.3) and update `CORS_ORIGIN` to the real Vercel URL(s), e.g.:
```
CORS_ORIGIN=https://your-app.vercel.app,https://*.vercel.app
```
Save — Render redeploys the backend automatically on an env var change. This is the one genuinely circular step in the whole runbook: the backend needs to know the frontend's URL, but the frontend needs the backend's URL to even be created.

### 16.6 Post-deploy smoke test

- [ ] `GET <ai-service-url>/ai/health` → `{"status":"ok","candidatesIndexed":N}`
- [ ] `GET <backend-url>/api/health` → 200
- [ ] Open the Vercel URL → **Home** page renders, sidebar shows all 7 items (Home, Add Candidates, Jobs, Candidate List, Analytics, Candidate Search, AI Chatbot).
- [ ] Create a Job on **Jobs**, reload the page, confirm it's still there (Postgres write survived).
- [ ] Upload 1-2 resumes from the pruned `resumes/` demo set on **Add Candidates** → confirm the full pipeline (parse → score → index) completes — this is the slowest path (3+ sequential LLM calls) and the first real DeepSeek-in-production test.
- [ ] **Candidate List** → the uploaded candidate appears, resume download link works (tests the backend's persistent uploads disk).
- [ ] **Candidate Search** → a natural-language query returns ranked, scored results.
- [ ] **AI Chatbot** → ask about a candidate, then an analytics-style question ("how many candidates do we have") → confirms both the RAG chat path and the chat-mediated analytics path work.
- [ ] **Analytics** → the dashboard loads stat tiles + charts with numbers matching what was just uploaded (tests the direct `/ai/analytics` → `/api/analytics` path).
- [ ] Toggle dark/light mode → persists across the new pages too.
- [ ] Resize to a mobile width → the sidebar collapses to a hamburger drawer on every page, including the new ones.
- [ ] Check both services' Render logs for unexpected 4xx/5xx during the walkthrough above.
- **LLM provider is fully pluggable** by design: every call funnels through `ai-service/core/llm_client.py`, so adding, removing, or reordering providers (as this project did twice — Groq → DeepSeek → RunPod-primary-with-DeepSeek-fallback) never requires touching an agent, a router, or a prompt.