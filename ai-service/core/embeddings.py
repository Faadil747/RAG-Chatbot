"""
Sentence-transformer embedding model, loaded once and reused.

Model: nomic-ai/nomic-embed-text-v1.5 (env `EMBEDDING_MODEL`), 768-dim. We
L2-normalize every embedding so Qdrant's cosine distance behaves correctly.

Nomic's model is instruction-tuned: text must be prefixed with a task tag for
good retrieval quality -- "search_document: " for text being indexed
(candidates), "search_query: " for a query being searched against them. See
https://huggingface.co/nomic-ai/nomic-embed-text-v1.5.
"""
from __future__ import annotations

import logging

import numpy as np
from sentence_transformers import SentenceTransformer

from core.config import settings

logger = logging.getLogger("ai-service.embeddings")

_model: SentenceTransformer | None = None

EMBEDDING_DIM = 768  # nomic-embed-text-v1.5 output dimension

DOCUMENT_PREFIX = "search_document: "
QUERY_PREFIX = "search_query: "


def load_model() -> SentenceTransformer:
    """Load (once) and return the sentence-transformer model. Call at startup."""
    global _model
    if _model is None:
        logger.info("Loading embedding model %s ...", settings.embedding_model)
        _model = SentenceTransformer(settings.embedding_model, trust_remote_code=True)
        logger.info("Embedding model loaded.")
    return _model


def _ensure_model() -> SentenceTransformer:
    if _model is None:
        return load_model()
    return _model


def embed_text(text: str, prefix: str = DOCUMENT_PREFIX) -> np.ndarray:
    """Embed a single string -> normalized float32 vector of shape (dim,)."""
    model = _ensure_model()
    vec = model.encode([prefix + text], normalize_embeddings=True, convert_to_numpy=True)[0]
    return vec.astype("float32")


def embed_texts(texts: list[str], prefix: str = DOCUMENT_PREFIX) -> np.ndarray:
    """Embed a batch of strings -> normalized float32 matrix of shape (n, dim)."""
    model = _ensure_model()
    vecs = model.encode([prefix + t for t in texts], normalize_embeddings=True, convert_to_numpy=True)
    return vecs.astype("float32")


def build_candidate_embedding_text(candidate: dict) -> str:
    """Build the text blob embedded for a candidate: name+role+summary+skills+
    experience titles+tech stack, per the contract in /ai/index."""
    parts: list[str] = []

    def add(val):
        if val:
            parts.append(str(val))

    add(candidate.get("name"))
    add(candidate.get("currentRole"))
    add(candidate.get("aiSummary"))

    skills = candidate.get("skills") or {}
    parts.extend(skills.get("primary") or [])
    parts.extend(skills.get("secondary") or [])

    for exp in candidate.get("experience") or []:
        add(exp.get("role"))
        add(exp.get("company"))

    parts.extend(candidate.get("technologyStack") or [])
    parts.extend(candidate.get("suitableRoles") or [])

    return " | ".join(p for p in parts if p)
