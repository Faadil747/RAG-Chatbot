# AI Service -- AI-Powered Candidate Search Platform

The AI brain of the platform: resume parsing (PDF/DOCX/scanned), structured profile
generation, embeddings + vector search, natural-language candidate search with
explainable ranking, and a RAG-grounded conversational recruitment chatbot with memory.

Runs as a Python FastAPI app on port 8000, mounted under the `/ai` prefix. It is called
exclusively by the Node/Express backend (port 4000) -- it is never called directly by
the frontend. It owns its own lightweight candidate metadata store + FAISS vector index,
kept in sync by the backend calling `POST /ai/index` after every resume upload/parse.

## Setup

1. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS/Linux
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy the env template and fill in your Groq API key:

   ```bash
   cp .env.example .env
   # then edit .env and set GROQ_API_KEY=...
   ```

4. (OCR only) Install the Tesseract OCR binary on your host if you want the scanned-resume
   fallback to work. `pytesseract` is just a Python wrapper -- it shells out to the
   `tesseract` binary, which is a separate system install:

   - Windows: install the Tesseract Windows build and ensure `tesseract.exe` is on PATH.
   - macOS: `brew install tesseract`
   - Debian/Ubuntu: `apt-get install tesseract-ocr`

   OCR also needs `poppler` (via `pdf2image`) to rasterize PDF pages:

   - Windows: install a poppler Windows build and add its `bin/` to PATH.
   - macOS: `brew install poppler`
   - Debian/Ubuntu: `apt-get install poppler-utils`

   If `tesseract` isn't installed, OCR calls log a warning and return empty text instead
   of crashing the request -- direct text extraction (PyMuPDF/pdfplumber/python-docx)
   works fine without it; only scanned/image-only resumes need OCR.

5. Run the dev server:

   ```bash
   uvicorn main:app --reload --port 8000
   ```

   On first run, `data/` is created automatically with an empty FAISS index and an empty
   `candidates_store.json` -- there's nothing to pre-seed.

## Environment variables

See `.env.example`:

| Variable | Purpose |
|---|---|
| `PORT` | Port the service listens on (informational; actual port is set via the uvicorn CLI flag). |
| `GROQ_API_KEY` | API key for the Groq LLM provider. |
| `GROQ_MODEL` | Groq model id, default `llama-3.3-70b-versatile`. |
| `EMBEDDING_MODEL` | sentence-transformers model id, default `BAAI/bge-small-en-v1.5`. |
| `DATA_DIR` | Directory for the FAISS index + candidate JSON store, default `./data`. |
| `CORS_ORIGIN` | Origin allowed to call this service (the backend), default `http://localhost:4000`. |

## Architecture

```
main.py                  FastAPI app, CORS, startup (load embedding model + candidate store)
core/
  config.py               env-driven settings singleton
  llm_client.py            ONLY place that talks to Groq -- chat_json / chat_text
  experience_calc.py       deterministic date-range -> totalExperienceYears math
  embeddings.py            sentence-transformers wrapper
  vector_store.py          FAISS IndexFlatIP wrapper (load/save/upsert/remove/search)
  parsing/
    pdf_parser.py          PyMuPDF primary, pdfplumber fallback
    docx_parser.py         python-docx
    ocr_parser.py          pytesseract + pdf2image scanned-resume fallback
    text_extractor.py      orchestrates the above + the OCR trigger threshold
models/                   Pydantic v2 models, camelCase JSON via alias_generator=to_camel
agents/                   one focused module per agent (see below)
memory/
  conversation_memory.py  in-memory per-session chat state
rag/
  prompt_builder.py       assembles the chatbot's system+user prompt
services/
  candidate_store.py      the service's own DB: JSON store + FAISS, asyncio.Lock guarded
  search_pipeline.py       shared search pipeline used by /ai/search and /ai/chat
routers/
  parse.py, index_.py, search.py, chat.py
data/                     faiss.index, vector_ids.json, candidates_store.json (gitignored)
```

### Agents

- `resume_parser_agent.py` -- LLM: raw text -> structured fields (name, contact, experience, education, projects, certifications, languages, previous companies).
- `skill_extraction_agent.py` -- LLM: experience+projects+raw text -> `skills.primary` / `skills.secondary`.
- `profile_generation_agent.py` -- LLM: aiSummary, careerHighlights, strengths, weaknesses, suitableRoles, technologyStack, overallRating.
- `search_agent.py` -- LLM: natural-language query -> structured search intent.
- `ranking_agent.py` -- deterministic Python scoring (NOT an LLM call): weighted sub-scores -> matchScore.
- `recommendation_agent.py` -- LLM: grounded `Justification` object (match reasons, concerns, hiring recommendation, interview questions) for one candidate.
- `chatbot_agent.py` -- LLM: final conversational reply + suggestions + candidateIds.
- `validation_agent.py` -- heuristic + LLM fallback: is this chat message in the recruiting/candidate domain?

## Endpoints (all under `/ai`)

- `POST /ai/parse` -- multipart `file` -> full Candidate JSON (not persisted).
- `POST /ai/index` -- Candidate JSON (+ optional `uploadedAt`) -> upsert into the store/index.
- `DELETE /ai/index/{candidate_id}` -- remove from the store/index.
- `POST /ai/search` -- `{ query, topK }` -> ranked `SearchResult[]` with justifications on ranks 1-3.
- `POST /ai/search/analysis` -- `{ query, candidateId }` -> on-demand `Justification`.
- `POST /ai/chat` -- `{ sessionId, message }` -> RAG chatbot reply with memory.
- `GET /ai/health` -- `{ status, candidatesIndexed }`.

## Notes / deviations

- The `Justification` object shape (not fully specified in the contract) is defined as:
  `{ candidateId, summary, matchReasons[], concerns[], hiringRecommendation, interviewQuestions[] }`.
  It's reused for search-result justifications, on-demand `/ai/search/analysis`, and the
  chat "generate interview questions" / "hiring recommendation" flows.
- Ranking weights (`agents/ranking_agent.py`) are named constants summing to 1.0:
  skill 0.22, designation 0.18, technology 0.18, experience 0.15, industry 0.12,
  education 0.10, freshness 0.05 -- skill/tech/designation weighted highest, freshness lowest,
  per the spec.
