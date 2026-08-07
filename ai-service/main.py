"""
AI-SERVICE entrypoint: FastAPI app exposing the /ai prefix consumed
exclusively by the Node/Express backend (never called directly by the
frontend).

Run with: uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.embeddings import load_model
from models.search import HealthResponse
from routers import analytics as analytics_router
from routers import chat as chat_router
from routers import index_ as index_router
from routers import jobs as jobs_router
from routers import parse as parse_router
from routers import search as search_router
from services.candidate_store import candidate_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai-service.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI service...")
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    # Every agent call goes through asyncio.to_thread onto the loop's default
    # executor, which defaults to min(32, cpu_count + 4) workers -- on a
    # small machine that's as few as 8. These calls are I/O-bound (waiting on
    # an LLM API over the network), not CPU-bound, so that ceiling only
    # starves concurrent requests (e.g. a bulk resume import queuing out an
    # interactive chat/upload) without protecting any real local resource.
    # Widen it explicitly.
    asyncio.get_running_loop().set_default_executor(ThreadPoolExecutor(max_workers=64))

    # Load the embedding model and the candidate store (JSON + FAISS) once.
    load_model()
    candidate_store.load()

    logger.info("AI service ready. %d candidates indexed.", candidate_store.count)
    yield
    logger.info("Shutting down AI service.")


app = FastAPI(
    title="AI-Powered Candidate Search Platform -- AI Service",
    description=(
        "Resume parsing, structured profile generation, embeddings + vector "
        "search, explainable candidate ranking, and a RAG-grounded "
        "conversational recruitment chatbot. Called exclusively by the "
        "Node/Express backend."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router.router, prefix="/ai", tags=["parse"])
app.include_router(index_router.router, prefix="/ai", tags=["index"])
app.include_router(search_router.router, prefix="/ai", tags=["search"])
app.include_router(chat_router.router, prefix="/ai", tags=["chat"])
app.include_router(jobs_router.router, prefix="/ai", tags=["jobs"])
app.include_router(analytics_router.router, prefix="/ai", tags=["analytics"])


@app.get("/ai/health", response_model=HealthResponse, response_model_by_alias=True)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", candidates_indexed=candidate_store.count)
