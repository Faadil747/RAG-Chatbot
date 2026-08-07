# AI-Powered Candidate Search Platform — Project Report

**Author:** Mohammed Faadil
**Report date:** 2026-08-07
**Scope:** The engineering work, research, and design decisions behind the RAG-based AI recruiting chatbot/platform — the idea, the technology chosen, model/infra performance, the scoring system, and the measured positive/negative trade-offs of each decision. Deployment/hosting steps (Render, Vercel, Docker) are intentionally excluded — this document is about what was *built and researched*, not how it was *shipped*.

---

## 1. The Original Idea

The starting problem: recruiters manually screening resumes is slow, inconsistent, and impossible to audit — two recruiters looking at the same stack of resumes for the same role will rank candidates differently, and neither can fully explain *why* a candidate was placed where they were.

The idea was to build an **AI-first recruiting platform** where:

1. A recruiter drops resumes in (PDF/DOCX, including scanned/image-only PDFs) and gets back **fully structured candidate profiles** with zero manual data entry.
2. Every candidate is scored against a job's requirements using a **transparent, auditable formula** — not an opaque "the AI said 82%" black box. If a candidate is ranked #1, the recruiter can see exactly which of nine sub-scores drove that.
3. A **conversational assistant** sits over the whole candidate database — the recruiter can ask "show me the best Python developers," then "compare top 3," then "generate interview questions for them," in natural follow-up language, without repeating candidate names — and the assistant is **hard-gated** to only ever talk about the uploaded candidate pool (never general knowledge, never hallucinated candidates).
4. All of this had to work with a **swappable LLM backend** — since LLM providers/pricing/availability change, no agent or router should ever hard-depend on one vendor's SDK.

This shaped the two central engineering commitments that show up everywhere in the codebase:

- **Never trust the LLM with anything that has a deterministic ground truth.** Match scoring, total-experience-years arithmetic, and availability parsing are all plain Python — the LLM is only used for the fuzzy, language-understanding parts of the pipeline (reading raw resume text, reading a natural-language query, writing a summary/justification in English).
- **One choke point per external dependency.** Every LLM call goes through a single file (`llm_client.py`); every vector operation goes through a single wrapper (`vector_store.py`). This is what made it possible to change the embedding model, swap FAISS for Qdrant, and reorder three LLM providers twice — all without touching a single agent's business logic.

---

## 2. System Architecture (What Was Actually Built)

Three independently-runnable services, communicating over a fixed JSON contract:

| Service | Stack | Responsibility |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite, Tailwind + hand-built Radix-based component library, Zustand, Recharts | The only UI. Never talks to the AI service directly — everything goes through the backend. |
| **Backend** | Node.js + Express + TypeScript, Prisma + PostgreSQL | Thin orchestration + persistence layer. Owns candidate CRUD, file uploads, chat history persistence. **Has no LLM logic of its own** — it proxies all AI work to the ai-service. |
| **AI Service** | Python 3.11 + FastAPI + Uvicorn, Pydantic v2 | The actual AI brain: resume parsing, embeddings, vector search, deterministic scoring, the RAG chatbot. Owns its own lightweight store (`candidates_store.json` + a local Qdrant collection). |

**Why split the "database" in two** (Postgres in the backend vs. JSON+Qdrant in the ai-service) instead of one shared store: Postgres is the system of record for product concerns (CRUD, filters, pagination, chat history — relational strengths); the ai-service's JSON+Qdrant pair is a purpose-built retrieval index (vector-search strengths). They're kept in sync by a single write path (`POST /ai/index` after every upload/reassignment), which keeps each service independently reasonable, testable, and scalable.

**Positive impact:** clean separation of concerns meant the AI internals (embedding model, vector store, LLM provider) could all be swapped mid-project without a single frontend or backend code change — verified in practice (see §5, §6).

**Negative impact / cost paid:** two candidate stores means an implicit consistency invariant ("ai-service index is derived from Postgres, always") that isn't automatically enforced — if the ai-service's local store is ever wiped, there is no automated re-sync job; every existing Postgres candidate would need to be re-posted to `/ai/index` by hand. This was accepted as a reasonable trade for a single-recruiter internal tool, not for a multi-tenant product.

---

## 3. Resume Parsing Pipeline

Every resume goes through the same deterministic pipeline before it's usable by any other feature:

1. **Text extraction** — PyMuPDF first for PDFs. If direct extraction yields under 50 characters (a scanned/image-only document), it automatically falls through to an **OCR path**: `pdf2image` rasterizes each page at 200 DPI, `pytesseract` OCRs each page, results are joined. DOCX goes through `python-docx` directly.
2. **Resume Parsing Agent** (LLM) — one call, extracts every factual field (name, contact, experience, education, projects, certs, languages) as strict JSON, instructed to never invent unstated data.
3. **Skill Extraction Agent** (LLM) — classifies skills into `primary` (central, recent, repeated) vs. `secondary` (peripheral, older, "familiar with"), normalizing synonyms.
4. **Deterministic experience-years computation** (pure Python, see §8) — because this is arithmetic with a correct answer, not something worth an LLM call's non-determinism.
5. **Availability inference** — regex over raw text (no LLM call at all — cheap, deterministic signal).
6. **Profile Generation Agent** (LLM) — the final judgement call: `aiSummary`, honest strengths **and** weaknesses (the prompt explicitly forbids overselling a thin resume), suitable roles, tech stack, an `overallRating` (0–100, calibrated bands).
7. **Embedding + indexing** — a purpose-built "embedding text" (name + role + summary + skills + experience titles + tech stack + suitable roles) is embedded and upserted into Qdrant.

**Design choice worth flagging:** the OCR stack is `pytesseract` + `pdf2image` rather than PaddleOCR. This was a deliberate trade of some OCR accuracy/robustness for a dramatically lighter dependency footprint (no native build toolchain to install/maintain) — and the OCR call is isolated behind one function (`_ocr_image`) so swapping engines later doesn't touch the trigger logic.

**A real bug found and fixed during development:** a smaller/faster LLM occasionally left `durationMonths` at `0` for undated experience entries ("2 yrs" written instead of real dates) despite explicit prompt instructions. Rather than just prompt-tune around it, a **deterministic regex backfill** (`find_relative_duration_mentions` / `backfill_missing_durations`) was added as a safety net: if an experience entry ends up with neither dates nor a duration after the LLM call, the raw resume text is scanned for `"\d+\s*(years?|yrs?|months?|mos?)"` mentions and back-filled positionally. This is a concrete example of the "never trust the LLM alone for anything checkable" principle paying off — the fix targets the actual failure mode instead of hoping a bigger model never makes the same mistake.

---

## 4. The Eight AI Agents

Rather than one giant prompt, the system is split into 8 single-purpose modules, each with its own tightly-scoped prompt:

| # | Agent | LLM call? | Job |
|---|---|:---:|---|
| 1 | Resume Parsing Agent | Yes | Raw text → structured factual fields |
| 2 | Skill Extraction Agent | Yes | Experience/projects/text → primary/secondary skills |
| 3 | Profile Generation Agent | Yes | Everything so far → summary, strengths/weaknesses, suitable roles, rating |
| 4 | Candidate Search Agent | Yes | Natural-language query → structured search intent (no scoring) |
| 5 | **Ranking Agent** | **No** | Structured intent + candidate → 7–9 weighted sub-scores → blended match score |
| 6 | Chatbot Agent | Yes | Assembled RAG prompt → grounded reply + suggestions + candidate IDs |
| 7 | Recommendation Agent | Yes | One candidate + query/focus → grounded justification / interview questions / hiring call |
| 8 | Validation Agent | Sometimes | Domain gate-keeping — regex first, LLM only for genuinely ambiguous input |

Two of these are **deliberately not LLM calls**, on purpose — this was a conscious architectural stance, not a missed opportunity:

- **Ranking** must be stable, explainable, cheap, and reproducible — an LLM doing "vibes-based" scoring would be slower, more expensive, and give a different answer for the same candidate/job pair on two different days.
- **Validation** front-loads fast regex checks (greetings, short follow-ups, ~25 recruiting keywords) and only spends an LLM call on genuinely ambiguous input — in a real conversation, most turns never need the extra round-trip.

---

## 5. LLM Provider Layer — Research, Iteration, and Performance

### 5.1 The provider-agnostic design

All LLM calls in the entire service go through **one file**, `core/llm_client.py`. No agent, router, or other module imports `openai` or `groq` directly. This single architectural constraint is what made it possible to reorder LLM providers **twice** over the project's life without touching a single agent, prompt, or router:

**Groq → DeepSeek → RunPod-primary-with-DeepSeek-fallback**

### 5.2 The three providers evaluated

| Provider | Role | SDK | Model used | Notes from real use |
|---|---|---|---|---|
| **Groq** | Original / optional third provider | `groq` official SDK | `llama-3.3-70b-versatile` | Fast inference (Groq's LPU hardware), free/cheap tier, good for early prototyping. Kept wired in as a selectable option even after being dropped as primary. |
| **RunPod (self-hosted Ollama)** | Final dev-time primary | `openai` SDK pointed at a RunPod-proxied Ollama `/v1` endpoint | `qwen2.5:14b` | Self-hosted GPU inference reached through a RunPod serverless/proxy endpoint. Chosen as primary specifically because **14B and tools-capable** meant materially better instruction-following on structured-output tasks (e.g. converting "2 yrs" into `durationMonths` — the exact rule that a smaller model kept missing, per §3). |
| **DeepSeek** | Final production primary / dev-time fallback | `openai` SDK (DeepSeek's `/chat/completions` is OpenAI-compatible) | `deepseek-v4-flash` / `deepseek-chat` | Used as production's *only* provider (RunPod/Groq are dev-time alternates) — no self-hosted GPU dependency in production, works purely on API keys. |

Because Ollama's `/v1` routes and DeepSeek's API are both OpenAI-compatible, the exact same client class and call shape (`client.chat.completions.create(...)`) works for both — the calling code (`_completion_content`) is 100% provider-agnostic. This is a direct, verifiable payoff of the single-choke-point design: adding a second/third provider was a config change, not a code change.

### 5.3 RunPod / Ollama performance — findings

- **Positive:** the 14B `qwen2.5` model, run with tool/instruction-following capability, was materially more reliable than the smaller models tried earlier in development at following exact structural rules embedded in prompts (JSON shape compliance, the specific "convert relative duration to `durationMonths`" rule). Self-hosting also means **no per-token API cost** for the primary provider during development — only RunPod compute time.
- **Negative:** a RunPod serverless/proxy endpoint is subject to **cold starts** — an idled pod can take far longer to respond than a live one. This directly caused a real infrastructure decision: the OpenAI SDK's default request timeout is ~600 seconds, which is far longer than acceptable when the Node backend itself times out at 60s on `/ai/chat` and `/ai/search`. An explicit **`LLM_REQUEST_TIMEOUT` (default 20s)** was added specifically so a stuck/cold-starting RunPod pod fails *fast* into the fallback chain instead of hanging the whole request pipeline.
- **Negative (production fit):** a self-hosted GPU endpoint is an operational dependency (uptime, cost while idle or cold, no vendor SLA) that isn't appropriate for a production deployment with no dedicated infra ops — this is exactly why the final production configuration drops RunPod entirely and runs DeepSeek only (see §5.5).

### 5.4 DeepSeek performance — findings

- **Positive:** OpenAI-compatible API including native JSON mode (`response_format={"type":"json_object"}`) meant zero adapter code was needed. Purely API-key-based, no infra to run or keep warm — the right shape for a production deployment.
- **Negative — the most significant reliability finding of the whole LLM layer:** DeepSeek's model is a **reasoning model** — it spends part of its `max_tokens` budget on internal "thinking" (`reasoning_content`) that the application never reads, *before* writing the actual JSON answer. Observed in practice: one ordinary resume-parsing call spent **~5,500 tokens "thinking"** before producing **~1,600 tokens** of real output — and that reasoning length is **non-deterministic per call**. A token budget that's too tight doesn't produce a bad answer — it produces `finish_reason: "length"` with **zero visible content**, which without special handling would look like the provider silently returning nothing.
  - This directly caused a piece of real engineering: an `_EmptyCompletionError` path in `llm_client.py` that specifically detects "HTTP 200, but empty content" and treats it as a retryable failure rather than a valid (if unparseable) answer. When it's a budget issue (`finish_reason == "length"`), the **same provider** is retried once with a larger budget (up to 14,000 tokens) and a longer timeout (110s) *before* falling back to a different provider — because jumping to another provider on what's really "give it more room" wastes the retry on the wrong fix.
  - Also observed: pushing the token ceiling higher doesn't just fix reliability — it lets the model reason even longer (observed calls taking **60–90+ seconds at a 16k-token ceiling**), which is why the retry ceiling is deliberately capped at 14,000 tokens rather than pushed further — a direct, measured reliability-vs-latency trade-off, tuned from observed behavior rather than guessed.
- **Account-specific quirk found:** the exact DeepSeek model name accepted differs per API key/account (the 400 error response itself names the valid options) — documented explicitly so a future setup doesn't waste time guessing.

### 5.5 Groq performance — findings

- **Positive:** very low latency (Groq's custom inference hardware), was the original starting provider and stayed wired in as a selectable option, useful as a cheap/fast option for classification-style calls (e.g. the Validation Agent's ambiguous-message classifier, which only needs 50 tokens of output).
- **Negative:** dropped as primary — llama-3.3-70b's instruction-following on the more structurally demanding extraction tasks (multi-field resume parsing, the relative-duration rule) was less consistent in practice than the 14B tools-tuned Ollama model, which is what motivated the switch to RunPod-primary.

### 5.6 Provider-chain reliability engineering (general findings, not vendor-specific)

Beyond individual providers, real engineering went into making the **chain itself** robust:

- **`max_retries=0`** is set explicitly on every SDK client. The default (2 extra attempts per call) would silently *multiply* every timeout — a single slow call could balloon to 3× the configured timeout before the app-level fallback logic even saw the exception. The app owns retry policy, not the SDK's defaults.
- **Two distinct empty-response causes are handled differently**: a budget-exhausted reasoning model (`finish_reason: "length"`) gets a bigger-budget retry on the *same* provider; a model that stopped on its own (`finish_reason: "stop"`) but produced nothing gets one identical-parameter retry (a one-off non-deterministic fluke) before falling through the provider chain.
- **JSON-mode is defended in depth**: every call requests native JSON mode, but `_extract_json()` still strips stray markdown fences and, failing a direct parse, grabs the widest `{...}` span in the text — and if parsing still fails, `chat_json()` retries once more with an explicit "your last response wasn't valid JSON" instruction, still going through the full provider chain.

**Net effect (measured qualitatively against pre-fix behavior during development):** requests that would previously either hang for minutes on a cold RunPod pod, or silently fail on a DeepSeek reasoning-budget miss, now fail over predictably within a bounded time window, or succeed on a same-provider retry with a corrected budget — this is the single largest reliability improvement made to the AI layer, and it generalizes to any future OpenAI-compatible provider added to the chain.

---

## 6. Embedding Model — Research and Performance

### 6.1 The journey: `BAAI/bge-small-en-v1.5` → `nomic-ai/nomic-embed-text-v1.5`

| Aspect | `BAAI/bge-small-en-v1.5` (original) | `nomic-ai/nomic-embed-text-v1.5` (final) |
|---|---|---|
| Dimensions | 384 | 768 |
| Size class | "small" — fast, low memory | Mid-size, instruction-tuned |
| Task conditioning | None — same encoding for documents and queries | **Task-prefixed**: `"search_document: "` for indexed text, `"search_query: "` for the query at search time |
| Where it runs | CPU, via `sentence-transformers` | CPU, via `sentence-transformers` (`trust_remote_code=True`) |

**Why the switch:** the smaller BGE model is a solid general-purpose baseline, but the project's retrieval quality bar needed something stronger for **asymmetric retrieval** (short recruiter query vs. long, information-dense candidate profile text) — which is exactly what Nomic's instruction-tuned, task-prefixed embedding model is designed for. Nomic embeds a query and a document differently on purpose (different prefix tokens), which produces measurably better alignment between "Python developers with 5 years experience" and a candidate profile that never uses that exact phrasing.

### 6.2 Positive impact of the switch

- Retrieval quality: semantic similarity searches land on *relevant* candidates rather than surface keyword overlap, because the **embedding text itself is engineered**, not just raw resume text — it's built from `name + currentRole + aiSummary + skills.primary + skills.secondary + (experience role, company) + technologyStack + suitableRoles`. This foregrounds the *judged* signal (AI-generated summary, categorized skills) alongside raw facts.
- Runs entirely on CPU with no external API dependency or per-call cost — embeddings are "free" and local, which matters for a pipeline that embeds every candidate at upload time and every search query at query time.
- L2-normalized vectors + cosine distance in Qdrant is a correct, standard pairing for this model family.

### 6.3 Negative impact / cost paid

- Double the vector dimensionality (768 vs. 384) — larger index on disk, marginally slower similarity computation per query. At the pool sizes this project was built and tested against (dozens to low hundreds of candidates), this cost is negligible; it would need re-evaluating at a much larger candidate pool (tens of thousands+).
- `trust_remote_code=True` is required to load Nomic's model — an accepted trust boundary (loading and executing model-author-provided code), reasonable for a known, reputable model but worth flagging as a deliberate choice, not a default.
- First-boot latency: the embedding model has to be downloaded and loaded into memory on service startup, which is the slowest part of a fresh deploy/restart (explicitly called out as something to watch for in the logs).

---

## 7. Vector Store — Research and Performance

### 7.1 The journey: FAISS → Qdrant (local/embedded mode)

The project started on **FAISS** (`IndexFlatIP`, a flat inner-product index with a separate `vector_ids.json` file to track id↔vector mapping) and moved to **Qdrant in local/embedded mode** (`QdrantClient(path=...)` — a real, SQLite-backed Qdrant instance requiring no server process, in the same "zero-install" spirit as the project's `pgserver`-based local Postgres fallback).

| Aspect | FAISS (`IndexFlatIP`) | Qdrant (local/embedded) |
|---|---|---|
| Upsert-by-id | Manual (track ids in a side JSON file, rebuild-on-remove) | **Native** — `client.upsert(...)` with an explicit id |
| Removal | Required a full index rebuild from the surviving vectors | Native point deletion by id |
| Persistence | Manual save/load of the index file + id-mapping JSON | Writes commit synchronously — no separate flush step |
| Query API | Raw similarity search only | Real vector-DB semantics — filtering, scrolling, payload storage available if needed later |
| Infra requirement | None (pure library, in-process) | None in local mode (file-based, single-process file lock) — but **can** point at a real hosted Qdrant server with no interface change |

### 7.2 Positive impact of the switch

- **Upsert-by-id and deletion became first-class operations** instead of hand-rolled bookkeeping — this directly simplified `services/candidate_store.py` and removed an entire class of "did the id-mapping file get out of sync with the index" bugs that FAISS's raw flat-index API doesn't protect against.
- **A real migration path to production-scale infrastructure exists without a rewrite** — because the `VectorStore` wrapper class kept the exact same public interface FAISS had, and because Qdrant's local mode and a hosted Qdrant server share a client API, moving to a hosted/clustered Qdrant later is a configuration change (a URL instead of a local path), not an architecture change.
- A real bug was caught and fixed during this migration via a throwaway smoke test: **`rebuild_from()` deliberately does *not* call `delete_collection()` + `create_collection()`**, because local-mode Qdrant was observed to leave old points still queryable afterward on the same client instance (an apparent stale in-memory collection handle in the local backend, undocumented behavior). The fix uses explicit point deletion instead — the same primitives already verified correct elsewhere — rather than relying on unverified collection-recreation semantics. This is a concrete example of **not trusting library behavior that wasn't directly observed to work**.

### 7.3 Negative impact / production-readiness limitation (research finding, not a deployment note)

The most important limitation identified in the whole system: **local/embedded Qdrant is tied to one process's local disk with a single-process file lock.** This means:

- It is correct and fully capable for a single-instance deployment (native similarity search, real upsert/delete semantics).
- It **cannot** be safely shared across multiple replicas of the ai-service — a multi-instance/autoscaled deployment would corrupt or lock-contend on the same file. Scaling out would require either a real **hosted Qdrant** cluster or a rewrite onto **pgvector** (piggybacking on the existing Postgres instance).
- This is a genuine architectural ceiling of the current design, not a bug — it was identified and documented deliberately (`docs`/README §15) rather than discovered the hard way later, and it directly informed why the current deployment target is pinned to exactly one instance (an infrastructure consequence of a research/architecture finding, not itself part of this report's deployment section).

---

## 8. The Candidate Scoring / Ranking System — Full Detail

This is the most heavily engineered, deterministic part of the platform, and the part explicitly designed to be **auditable** rather than a black box.

### 8.1 Why deterministic, not LLM-based

Two hard requirements drove this: **rankings must be reproducible** (the same candidate against the same job always produces the same score) and **rankings must be explainable** (a recruiter can point at which of nine sub-scores drove a given result). An LLM producing a "match percentage" would fail both — it would drift between calls, be slow, cost money per candidate per query, and offer no auditable breakdown. So `ranking_agent.py` is plain Python arithmetic; the LLM's only role in the ranking pipeline is upstream (reading a job description or query into structured requirements) and downstream (writing an English justification for the top 3 results) — never the scoring math itself.

### 8.2 The nine scoring dimensions and fixed weights

| # | Dimension | Weight | What it measures |
|---|---|---:|---|
| 1 | Skill Match | 20% | Overlap between required skills and the candidate's listed skills |
| 2 | Technology Match | 14% | Overlap between required skills/keywords and the candidate's *actual* technology stack (from project/work history, not self-listed skills) |
| 3 | Designation Match | 14% | Text-similarity between target role and the candidate's current/suitable roles |
| 4 | Experience Match | 15% | Whether total years of experience falls inside the job's required range |
| 5 | Industry Match | 9% | Keyword overlap between the job's industry/domain and the candidate's employment history |
| 6 | Education Match | 8% | Keyword overlap between the education requirement and the candidate's degrees/institutions |
| 7 | Location Match | 8% | Whether the candidate is based where the role requires (or the role is remote) |
| 8 | Availability Match | 7% | Whether the candidate can join within the needed timeframe |
| 9 | Resume Freshness | 5% | Light tie-breaker favoring more recently-added profiles |

Weights are **fixed constants summing to 100%**, applied identically to every candidate for a given job — no per-recruiter or per-job tuning, so every candidate is held to the same standard. If a job doesn't specify a requirement (e.g. no location given), that dimension scores a **neutral 50** rather than 0 or 100 — an unstated requirement can never be "failed."

```
Match Score =  (Skill Match        × 0.20)
             + (Technology Match   × 0.14)
             + (Designation Match  × 0.14)
             + (Experience Match   × 0.15)
             + (Industry Match     × 0.09)
             + (Education Match    × 0.08)
             + (Location Match     × 0.08)
             + (Availability Match × 0.07)
             + (Resume Freshness   × 0.05)
```
Rounded to one decimal, clamped to 0–100.

*(Note: the 7-weight table in the ai-service README covers the Candidate Search pipeline's shortlist ranking; the published 9-dimension rubric in `docs/CANDIDATE_SCORING_CRITERIA.md` — reproduced above — is the full job-fit scoring formula, adding Location and Availability as their own explicit weighted dimensions rather than folding them into the search-only path. Both are implemented in `ranking_agent.py` and are the authoritative, live formula — this report mirrors the published rubric, not a separate policy document that could drift from the code.)*

### 8.3 Engineering detail per dimension (what makes this non-trivial)

- **Skill/Technology matching — a real bug found and fixed:** an earlier version used a raw substring check for partial credit (`"java" in "javascript"`), which produced **false positives on skill pairs that share a prefix but are unrelated**: Java/JavaScript, C/C++/C#, Go/Django, R/React. This was identified as a correctness bug (not a style nitpick) and replaced with: (1) exact match after normalization, (2) a maintained **alias table** (`"js"`→`javascript`, `"k8s"`→`kubernetes`, `"postgres"`→`postgresql`, ~30 entries covering common recruiting-tech spelling variants), (3) whole-term fuzzy matching (`difflib.SequenceMatcher`, ratio ≥ 0.88) for genuine typos only, at 0.85× credit. This is a concrete example of catching and correcting a plausible-looking-but-wrong heuristic before it shipped.
- **Experience Match — soft upper-band logic:** exact range → 100. Below the minimum decays **15 points per year** short. For open-ended asks like "5+ years" (no stated max), a **soft comfort band** is used (min→min+5 for senior asks, min→min+2 for junior asks) rather than treating any experience level above the minimum as an equally perfect match — heavily over-qualified candidates lose **8 points per year** past that soft band, a lighter penalty than under-qualification, but still visible in the score.
- **Location Match — real-world alias handling:** a maintained city-alias table (Bangalore/Bengaluru, Gurgaon/Gurugram, Bombay/Mumbai, Madras/Chennai, Calcutta/Kolkata, and more) means common Indian city-name variants are treated as identical rather than scored as a mismatch. A clearly different city scores **20, not 0** — relocation/hybrid arrangements are common enough that a mismatch is a signal, not an automatic disqualifier. Missing location data scores neutral (50), never penalized.
- **Availability Match:** free-text availability ("Immediate", "Notice period: 30 days") is parsed into an approximate day-count and compared against the role's need; unknown availability scores 40 (a mild flag, not a hard penalty) rather than 0.
- **Industry Match — a second bug found and fixed:** an early version reused generic free-text keywords as industry evidence, which caused **false 100% Industry Match scores** for many candidates whenever a keyword like "SAP," "Java," or "Developer" happened to overlap — those are skill/role words, not industry evidence. Fixed by only scoring this dimension when the parser found an actual explicit industry/domain requirement; otherwise it stays neutral.

### 8.4 Positive impact

- Every ranked result carries a full sub-score breakdown, not just a single number — a candidate can score high on skills and experience while visibly low on Location Match, which is diagnostically different from an across-the-board weak match, and the recruiter can see that difference immediately.
- Deterministic scoring is essentially free to recompute (no LLM call, no network round-trip) — the entire shortlist (30 candidates from the vector search stage) can be scored and sorted in milliseconds, which is what makes ranking feel instant in the UI even though a semantic search and multiple LLM calls happened earlier in the same request.
- Two real correctness bugs (substring-based skill matching, keyword-reused-as-industry-evidence) were caught and fixed specifically **because** the scoring logic is inspectable, testable Python rather than opaque LLM output — a wrong LLM score would have been much harder to notice or explain.

### 8.5 Negative impact / known limitation

- The alias tables (skills, cities) are **hand-maintained** — new skill synonyms or city-name variants not already in the table silently fall through to fuzzy/no match rather than being recognized. This is a real, ongoing maintenance cost as the platform sees resumes from new domains/regions.
- Fixed weights, while good for consistency/fairness, cannot be tuned per-recruiter or per-role-family without a code change — a deliberate trade of flexibility for auditability and fairness (documented explicitly as "not tuned per job or per recruiter, so every candidate is held to the same standard").

---

## 9. Deterministic Experience-Years Computation

A dedicated module (`core/experience_calc.py`) exists purely to keep arithmetic out of the LLM's hands:

- Parses a wide variety of human date formats (`"Jan 2020"`, `"January 2020"`, `"2020-01"`, `"2020/01"`, `"2020"`, `"Present"/"Current"/"Till Date"`) into absolute month indices.
- **Merges overlapping/adjacent intervals** so two concurrent jobs (a common resume pattern — freelance + full-time overlap, or a role transition mid-month) don't get double-counted toward total experience.
- For entries with **no parseable dates at all** (resumes that state "2 yrs" instead of real dates), the LLM-extracted `durationMonths` for that entry is added on top of the merged dated total, since an undated entry can't be checked for overlap against anything.
- A regex-based backfill (§3) catches the case where the LLM extraction missed converting a relative duration at all.

**Positive impact:** total experience is stable and re-derivable — the same resume always produces the same number, and the computation can be unit-tested against known date strings, which an LLM-computed number cannot be.

**Negative impact / limitation:** the date-parsing regex set, while broad, is not exhaustive of every resume date format in the wild (e.g. non-English month names, unusual separators) — an unparseable, undated entry with also no relative-duration mention in the raw text contributes zero to total experience, which slightly under-counts in that specific edge case rather than over-counting (a deliberate conservative default).

---

## 10. Semantic Search & Retrieval Pipeline

The Candidate Search page and the chatbot's "new search" path share one pipeline (`services/search_pipeline.py`):

1. **Intent parsing** (Candidate Search Agent, LLM) — never matches on exact keywords; extracts structured intent (`designation`, `requiredSkills`, `minExperience`/`maxExperience`, `location`, `industry`, `education`, `availability`, `keywords`) with explicit rules for translating vague language into numbers (`"5+ years"` → `minExperience=5`; `"senior"` → `minExperience≈5`; `"lead"/"principal"` → `minExperience≈8`).
2. **Reformulation + embedding** — the raw query plus every piece of parsed intent is joined into one string, embedded with the `search_query:` prefix.
3. **Retrieval** — Qdrant returns the **30** nearest candidates by cosine similarity — a shortlist, not the final ranking.
4. **Deterministic ranking** (§8) scores and sorts the shortlist, top 10 returned.
5. **Auto-justification for ranks 1–3 only** (Recommendation Agent, LLM) — a deliberate cost control: ranks 4–10 get `justification: null` and a **"Generate AI Analysis"** button in the UI that calls the same agent on demand, only when a recruiter actually wants it.

**Positive impact of the cost-control design:** a single search request makes exactly 1 (intent) + 3 (justifications) = 4 LLM calls regardless of pool size, instead of scaling LLM cost linearly with candidates returned — this was a deliberate, load-tested design decision, not an accident of scope.

---

## 11. Conversational Chatbot & Memory — Design and Real Behavior

### 11.1 Per-session state

An in-memory, module-level store (deliberately **not** persisted to disk — durable history is the backend's Postgres responsibility, not the ai-service's job) tracks, per session: the last 20 turns, the last search's query and ranked results, every candidate id discussed so far (most-recent-first, deduplicated), and the ids in the most recent comparison.

### 11.2 Turn-by-turn pipeline

1. **Validation Agent gates the domain first** — fast regex handles greetings, short follow-ups ("compare top 3," "him"/"her"/"them"), and ~25 recruiting keywords; only genuinely ambiguous messages spend an LLM classification call. Out-of-domain messages get an exact, fixed refusal string and the pipeline stops — **no retrieval, no chat LLM call at all**, which is both a cost control and a hard grounding guarantee.
2. **Retrieval** — a message that looks like a new search ("show," "find," "who are") re-runs the full search pipeline (§10). Otherwise, `resolve_referenced_candidates()` figures out who's being discussed from memory alone: `"compare"`/`"top N"` → first N ids from the last search's rank order; ordinals ("the second one") → indexed into last results; pronouns ("him," "them") → most-recently-discussed candidate; a literal name in the message → that candidate.
3. **Interview-question / hiring-recommendation requests** are regex-detected and routed straight to the Recommendation Agent with a `focus` flag — grounded in real data instead of freely generated.
4. Otherwise, the **Prompt Builder** assembles a fixed system persona + trimmed candidate JSON (raw resume text and embedding text deliberately dropped — noise, not reasoning signal) + last 12 turns, and the **Chatbot Agent** produces the reply + 2–4 clickable suggestions + candidate ids.
5. Memory is updated; the backend separately persists both messages to Postgres for reload-safe history.

### 11.3 Verified end-to-end behavior (real conversation, confirmed working)

```
Recruiter: Show me the best Python developers
Assistant: [ranks real candidates by matchScore, summarizes top matches, suggests next steps]

Recruiter: Compare top 3
Assistant: [resolves the top 3 ids from memory with no names repeated by the recruiter,
            produces a grounded comparison]

Recruiter: Who won the IPL this year?
Assistant: "I can only answer questions related to the uploaded candidate database."
```

**This is the core UX bet of the whole project** — a recruiter never has to repeat a candidate's name mid-conversation, and the assistant provably never answers outside the uploaded data. Both were explicitly tested, not just designed.

### 11.4 Positive impact

- **Grounding is enforced at multiple independent layers**, not just a prompt instruction: the Validation Agent blocks off-domain input *before* retrieval even runs; the Prompt Builder physically limits what the model can see to only retrieved candidates (or exact computed numbers for analytics); the Recommendation Agent is explicitly instructed to surface honest concerns rather than paper over a weak match. A single point of failure (just "please don't hallucinate" in a prompt) was deliberately avoided.
- Follow-up resolution via conversation memory (regex-first, LLM-backed reference resolution only for ambiguous phrasing) keeps the common conversational path fast and cheap while still handling harder phrasing correctly.

### 11.5 Negative impact / limitation

- In-memory chat *reasoning* state does not survive an ai-service process restart (by design — durable history lives in Postgres, but the "who does 'them' refer to" context resets). Acceptable for a single-process dev/small-deployment tool; would need a shared session store (e.g. Redis — explicitly listed as an intentionally-not-implemented optional piece) for a multi-instance or high-availability deployment.
- Regex-based reference resolution and domain-gating, while fast and cheap, are heuristic — unusual phrasing not covered by the keyword/pattern lists falls through to the LLM classifier (correct, but slower and non-zero-cost) or, in the reference-resolution case, may fail to resolve correctly with no LLM fallback at all in some paths.

---

## 12. Analytics (Pool-Wide, Non-Search Questions)

A dedicated Analytics Agent handles aggregate/statistical chat questions ("how many Java developers do we have," "average experience for the DevOps job") by **bypassing the ranking/shortlist pipeline entirely** and computing exact statistics in Python over the whole candidate pool, then handing the model only the *computed numbers* with an explicit instruction to phrase them, never recompute them. This is the same "don't trust the LLM with arithmetic" principle applied to a second surface area — aggregate math is exactly the kind of thing an LLM will occasionally get subtly wrong (miscounting, rounding errors) if asked to do it over raw data in-context.

---

## 13. Consolidated Positive / Negative Impact Summary

| Decision | Positive impact | Negative impact / trade-off |
|---|---|---|
| Single LLM choke point (`llm_client.py`) | Reordered providers twice with zero agent changes; centralized timeout/retry/fallback logic | All LLM traffic depends on one file's correctness — a bug there affects every agent |
| RunPod/Ollama (`qwen2.5:14b`) as dev primary | Better instruction-following on structured extraction than smaller models; no per-token cost | Cold-start latency risk; self-hosted infra dependency, dropped for production |
| DeepSeek as production provider | API-key-only, no infra to run; OpenAI-compatible, zero adapter code | Reasoning-model token budget non-determinism caused silent empty completions until specifically handled |
| Deterministic ranking (no LLM) | Reproducible, explainable, near-free to recompute; caught 2 real matching bugs via code review | Alias tables need manual upkeep; weights aren't per-recruiter tunable |
| Deterministic experience-years math | Stable, testable, correct arithmetic | Regex date parsing isn't exhaustive of every real-world resume format |
| Nomic embedding model (task-prefixed) | Better asymmetric query↔document retrieval quality | 2× the vector dimensionality of the original model; `trust_remote_code=True` trust boundary |
| Qdrant local/embedded mode | Native upsert/delete-by-id; clean migration path to hosted Qdrant later; caught a real rebuild bug via smoke test | Single-process file lock — architecturally cannot scale to multiple replicas without a hosted store |
| Multi-layer grounding enforcement | Chatbot verifiably never answers outside the candidate pool | Regex-based gating/reference-resolution is heuristic; unusual phrasing can fall through to slower LLM paths or fail to resolve |
| In-memory chat session state | Simple, fast, no extra infra for a single-process deployment | Does not survive process restart; not multi-instance safe without adding Redis |
| Deferred justification generation (ranks 4–10 on demand) | Bounds LLM cost per search to a fixed 4 calls regardless of result count | Recruiter must take an extra click to see justification below rank 3 |

---

## 14. Production-Readiness Assessment (Architecture, Not Deployment)

This section evaluates *what was built*, not how it was hosted:

- **LLM layer:** production-ready as designed — the provider chain, timeout tuning, and empty-completion/reasoning-retry handling were all built from observed real failures, not speculative hardening. DeepSeek-only (no self-hosted RunPod dependency) is the right call for a production configuration with no dedicated GPU infra to operate.
- **Scoring/ranking:** production-ready — deterministic, fast, auditable, and already had two real correctness bugs found and fixed via review rather than left latent.
- **Vector store:** production-ready **for a single-instance deployment only**. This is the one component with a hard architectural ceiling — genuine horizontal scaling would require a hosted Qdrant cluster or a pgvector rewrite, not a configuration tweak.
- **Chat memory:** appropriate for a single-recruiter/single-instance tool; would need externalized session state (Redis or similar) before being safe under multiple service instances.
- **Security/auth:** by explicit design, there is no authentication anywhere in the stack — a conscious scope decision for a "single-recruiter internal tool," **not** an oversight, but a hard blocker before this could be exposed to untrusted users without an added gate.

---

## 15. Summary — What This Project Actually Demonstrates

Beyond the feature list, the engineering substance of this project is in the parts that don't show up in a demo:

- Correctly identifying **which parts of a RAG/agentic pipeline must never be delegated to an LLM** (arithmetic, ranking, aggregate stats) and enforcing that with dedicated deterministic code, verified against real LLM failure modes observed during development (missed duration conversions, reasoning-budget-exhausted empty completions).
- A **provider- and store-agnostic architecture** that was genuinely exercised, not just designed on paper — three LLM providers were actually swapped in and out, and the vector store was actually migrated from FAISS to Qdrant, both without touching agent logic.
- **Bugs found and fixed through inspection of deterministic, auditable code** that would have been far harder to catch (or explain) had the same logic lived inside an opaque LLM call — the substring skill-matching false positives and the industry-keyword false-100% bug are the clearest examples.
- Multi-layered grounding for the chatbot, engineered as several independent enforcement points rather than a single prompt instruction — and verified end-to-end against both in-domain and out-of-domain conversation.
