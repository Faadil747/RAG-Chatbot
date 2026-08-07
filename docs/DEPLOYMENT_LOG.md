# Deployment Log — Render + Vercel

**Scope:** how this project was actually taken from "runs on localhost" to live on the internet — the real sequence of steps, what broke along the way, and exactly what fixed it. This complements `docs/PROJECT_REPORT.md` (which covers what was *built*, not how it was *shipped*) and the prescriptive step-by-step in `README.md` §16 (which is the reusable runbook; this document is the record of actually walking it).

**Target topology:** 3 Render services (managed Postgres, the Python ai-service, the Node backend) + 1 Vercel project (the React frontend). DeepSeek is the sole LLM provider in production — RunPod/Groq are dev-only alternates and were left unconfigured.

---

## Status as of this log

| Piece | Platform | State |
|---|---|---|
| PostgreSQL | Render | Provisioned |
| ai-service | Render (`RAG-Chatbot-1`, Docker, free tier) | **Live** — `https://rag-chatbot-1-de7w.onrender.com`, healthy, boots cleanly |
| backend | Render (Docker, free tier) | In progress — follows the same runbook shape as ai-service, no equivalent problems hit so far |
| frontend | Vercel | In progress — import was pointed at the wrong GitHub repo; corrected, redeploying |

(Keep this table current as later steps complete — it's the fastest way to answer "what's actually live right now" without re-reading the whole log.)

---

## 1. ai-service — the hard part

This service was the source of every real problem in this deployment, for one underlying reason: it's the only piece running local ML inference (PyTorch + sentence-transformers) inside Render's free-tier **512MB** memory ceiling, alongside FastAPI, a vector DB client, and several document-parsing libraries — all in one process.

### Attempt 1: straight OOM at boot

First deploy used the configuration the app had been running in dev: `EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5`. The deploy log showed:

```
==> No open ports detected, continuing to scan...
   (repeats for ~5 minutes)
==> Out of memory (used over 512MB)
```

**Diagnosis:** Nomic's model weights alone are ~550MB in float32 — already over the entire memory budget before FastAPI, PyTorch's own runtime, or anything else loaded. The process never got far enough to bind a port; Render's boot-time port scanner just kept retrying until the container was killed.

**Fix, round 1:**
- Switched `EMBEDDING_MODEL` to `BAAI/bge-small-en-v1.5` (~130MB of weights vs. ~550MB) — this was a real trade-off (smaller model = somewhat weaker semantic search), made deliberately after confirming with the project owner rather than silently downgrading it.
- Pinned PyTorch to its CPU-only wheel in `requirements.txt` (`--index-url https://download.pytorch.org/whl/cpu`) — unpinned, pip resolves the default PyPI `torch`, which on Linux is the much larger CUDA build. This service never touches a GPU.
- Added `OMP_NUM_THREADS=1` as a Render env var — caps PyTorch's CPU thread pool, a real (if smaller) memory reduction on a fractional-CPU instance where multiple threads buy nothing.

### Attempt 2: still OOM, but *later* — while loading the smaller model

```
2026-08-07 ... INFO ai-service.embeddings: Loading embedding model BAAI/bge-small-en-v1.5 ...
2026-08-07 ... INFO sentence_transformers.SentenceTransformer: Load pretrained SentenceTransformer: BAAI/bge-small-en-v1.5
==> Exited with status 137   (Linux OOM-killer signal)
```

**Diagnosis:** round 1's fixes were real but not sufficient — they addressed the model's own size, not the fact that a lot of *other* heavy libraries were also being imported eagerly at startup, all competing for the same 512MB before the model even got a chance to load:
- `PyMuPDF`, `pdfplumber` (PDF parsing) and `python-docx` (DOCX parsing) were imported at module top-level in `core/parsing/*.py`, even though they're only needed when an actual resume is uploaded.
- The `groq` SDK was imported at module top-level in `core/llm_client.py`, even though production never configures Groq as a provider.
- The embedding model itself was loaded synchronously during FastAPI's startup `lifespan`, **before** `uvicorn` ever bound its port — meaning Render's port scanner had nothing to find until the (memory-heavy) load finished, or the process got killed trying.

**Fix, round 2:**
- Made the PDF/DOCX parsing imports and the `groq` import lazy — moved `import fitz`, `import pdfplumber`, `from docx import Document`, and `from groq import Groq` from module level into the specific functions that use them. A process that's only ever served a health check or a search no longer pays to hold PDF-parsing libraries resident in memory.
- Removed the eager `load_model()` call from `main.py`'s startup `lifespan`. The embedding functions in `core/embeddings.py` already had a lazy-load fallback (`_ensure_model()`) for exactly this case — so nothing else had to change. This means `uvicorn` now binds its port almost immediately (~0.25s locally, verified), the health check goes green right away, and the actual torch/transformers/model import cost is deferred to the first request that genuinely needs it (a parse, a search, a chat "find..." query, or an analytics query with a skill filter). Verified locally end-to-end: first search after a fresh boot takes longer (model loading + LLM call), subsequent ones are fast.

### Attempt 3: clean boot, wrong port

```
INFO ai-service.main: Starting AI service...
INFO ai-service.vector_store: Loaded Qdrant collection 'candidates' with 0 vectors.
INFO ai-service.main: AI service ready. 0 candidates indexed.
INFO: Uvicorn running on http://0.0.0.0:8000
...
==> Continuing to scan for open port 4000 (from PORT environment variable)...
   (repeats until timeout)
```

No OOM this time — the memory fixes worked. The remaining problem was a plain config mistake: this service's `PORT` env var had been set to `4000` (the *backend's* port, copy-pasted from the wrong step of the runbook), while the app was listening on `8000`. Render scans for whatever `PORT` says, not what the app happens to bind.

**Fix:**
- Corrected the `PORT` env var on this service back to `8000`.
- Also fixed the underlying fragility in `ai-service/Dockerfile`: `CMD` was exec-form with a hardcoded `--port 8000`, which can't respond to whatever `PORT` a platform actually injects. Changed to shell form so `$PORT` is substituted at container start, defaulting to `8000` if unset:
  ```dockerfile
  CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
  ```
  (Checked the backend's Dockerfile too — it runs `node dist/index.js`, and the Node app already reads `process.env.PORT` internally via `backend/src/config/env.ts`, so no equivalent fix was needed there.)

### Also fixed along the way: wrong Root Directory

A separate, earlier attempt at creating this service failed immediately with:
```
error: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```
Cause: the Render service's **Root Directory** setting was left at the repo root instead of `ai-service` — Docker looked for `Dockerfile` at the top of the repo, which doesn't exist (only `ai-service/Dockerfile` and `backend/Dockerfile` do). Fixed via Render → Settings → Root Directory → `ai-service`.

### End state for ai-service

Deployed on Render's **free tier**, single instance (no autoscaling — the local embedded Qdrant collection holds a file lock that isn't safe to share across replicas), with a persistent disk mounted at `/app/data` so the vector store and candidate metadata survive restarts. Environment:

```
PORT=8000
LLM_PROVIDER=deepseek
LLM_FALLBACK_PROVIDER=deepseek
DEEPSEEK_API_KEY=<real key, not committed anywhere>
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
LLM_REQUEST_TIMEOUT=40
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
DATA_DIR=/app/data
CORS_ORIGIN=<the backend's Render URL>
OMP_NUM_THREADS=1
```

If the candidate pool or traffic grows enough to outgrow 512MB again after all of the above, the honest next step is upgrading this service's Render plan — not squeezing the code further. That escalation path is documented in `README.md` §16.2 so it isn't a dead end later.

---

## 2. backend (Render) and frontend (Vercel)

Following the same runbook shape as ai-service (`README.md` §16.3–16.4): Docker web service on Render with a persistent disk at `/app/uploads` for resume files, `DATABASE_URL` from the Render Postgres instance, `AI_SERVICE_URL` pointed at the ai-service's URL above, and a `sh -c "npx prisma migrate deploy && node dist/index.js"` start command so migrations apply automatically on every deploy.

One process note worth keeping for next time: **Vercel's project import initially pointed at the wrong GitHub repository** (`MohammedFaadil/AI-DSA-Assistant`, an unrelated project, instead of `Faadil747/RAG-Chatbot`). Root cause was GitHub's Vercel App integration being scoped to "only select repositories" and not including this one — fixed via `github.com/settings/installations` → Vercel → Configure → adding the repo to its allowed list, then re-opening Vercel's import screen.

Once the correct repo was selected, frontend config was straightforward: Root Directory `frontend`, framework auto-detected as Vite, build command `npm run build`, output directory `dist`, single env var `VITE_API_BASE_URL=<backend URL>/api`.

---

## 3. The CORS loop

Two independent `CORS_ORIGIN` values across the two Render services, each scoped to its actual caller — this tripped up "which service do I update?" more than once, so it's worth stating plainly:

| Service | `CORS_ORIGIN` | Because |
|---|---|---|
| ai-service | the **backend's** Render URL | only the backend calls ai-service directly; the browser never does |
| backend | the **Vercel** frontend URL(s), comma-separated, `*.vercel.app` wildcard included for preview deploys | the browser calls the backend directly |

The backend's `CORS_ORIGIN` necessarily starts as a placeholder (`http://localhost:5173`) at deploy time, since the Vercel URL doesn't exist until *after* the backend is already live — it gets updated once, after the frontend deploy, closing the loop.

---

## Lessons for next time

- **A local dev machine cannot predict container memory behavior**, especially across OS boundaries (this dev environment is Windows; Render's containers are Linux) — the two OOM rounds above could only be diagnosed from real Render deploy logs, not from anything measurable locally. Budget for at least one memory-tuning round on any service doing local ML inference on a constrained free tier.
- **Defer heavy imports and heavy startup work whenever a health check needs to succeed fast.** The single most effective fix here wasn't shrinking anything — it was making the port bind before the expensive model load, so the platform's own boot check could pass independently of whether the model load itself was fully optimized yet.
- **Docker `CMD` should read `$PORT` dynamically, not hardcode it**, on any platform (Render, Heroku, Railway, ...) that assigns its own port and scans for it.
- **Double-check platform-side GitHub App repo permissions before assuming an import failure is a code or account problem** — "I added the repo" in one UI doesn't always mean the other UI's permission scope was actually updated.
