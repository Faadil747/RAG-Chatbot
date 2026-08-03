"""
The service's own lightweight candidate metadata store + vector index.

This is intentionally separate from the backend's Postgres so that RAG
retrieval never needs a round-trip back to the backend. It is the
in-process "database" for this service:

  - `data/candidates_store.json` -- full candidate JSON (camelCase, contract
    shape) keyed by id, plus the two internal-only fields `uploadedAt` and
    `embeddingText`.
  - `data/faiss.index` + `data/vector_ids.json` -- the FAISS vector index
    and its parallel row-order id list.

Both are loaded into memory at startup and written straight through on
every index/delete op. All writes go through `self._lock` (an
`asyncio.Lock`) to keep concurrent index/delete requests from corrupting
either store.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from core.config import settings
from core.embeddings import build_candidate_embedding_text, embed_text
from core.vector_store import VectorStore

logger = logging.getLogger("ai-service.candidate_store")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CandidateStore:
    def __init__(self) -> None:
        self.candidates: dict[str, dict] = {}
        self.vector_store = VectorStore(settings.faiss_index_path, settings.vector_ids_path)
        self._lock = asyncio.Lock()

    # -- lifecycle -----------------------------------------------------

    def load(self) -> None:
        path = settings.candidates_store_path
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    self.candidates = json.load(f)
                logger.info("Loaded %d candidates from %s", len(self.candidates), path)
            except Exception:
                logger.exception("Failed to load candidates_store.json; starting empty.")
                self.candidates = {}
        else:
            self.candidates = {}

        self.vector_store.load()

        # Defensive resync: if the JSON store and FAISS diverge (e.g. a
        # process crash mid-write), trust the JSON store and rebuild FAISS.
        store_ids = set(self.candidates.keys())
        index_ids = set(self.vector_store.ids)
        if store_ids != index_ids:
            logger.warning(
                "candidates_store.json and FAISS index are out of sync "
                "(%d vs %d ids); rebuilding FAISS from the JSON store.",
                len(store_ids), len(index_ids),
            )
            self._rebuild_index_from_store()

    def _persist_candidates(self) -> None:
        path = settings.candidates_store_path
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(self.candidates, f, ensure_ascii=False, indent=2)
        tmp_path.replace(path)

    def _rebuild_index_from_store(self) -> None:
        ids: list[str] = []
        texts: list[str] = []
        for cid, candidate in self.candidates.items():
            ids.append(cid)
            texts.append(candidate.get("embeddingText") or build_candidate_embedding_text(candidate))

        if texts:
            from core.embeddings import embed_texts

            vectors = embed_texts(texts)
        else:
            import numpy as np

            from core.embeddings import EMBEDDING_DIM

            vectors = np.zeros((0, EMBEDDING_DIM), dtype="float32")

        self.vector_store.rebuild_from(ids, vectors)
        self.vector_store.save()

    # -- writes ----------------------------------------------------------

    async def upsert(self, candidate: dict, uploaded_at: str | None = None) -> str:
        """Insert or replace a candidate: builds its embedding, upserts into
        FAISS, write-throughs both stores to disk."""
        candidate_id = candidate["id"]
        embedding_text = build_candidate_embedding_text(candidate)
        vector = embed_text(embedding_text)

        async with self._lock:
            record = dict(candidate)
            record["embeddingText"] = embedding_text
            record["uploadedAt"] = uploaded_at or record.get("uploadedAt") or _now_iso()

            self.candidates[candidate_id] = record
            self.vector_store.upsert(candidate_id, vector)

            self._persist_candidates()
            self.vector_store.save()

        return candidate_id

    async def delete(self, candidate_id: str) -> bool:
        async with self._lock:
            existed = candidate_id in self.candidates
            if existed:
                del self.candidates[candidate_id]
            removed_from_index = self.vector_store.remove(candidate_id)

            if existed or removed_from_index:
                self._persist_candidates()
                self.vector_store.save()

            return existed or removed_from_index

    # -- reads -------------------------------------------------------------

    def get(self, candidate_id: str) -> dict | None:
        return self.candidates.get(candidate_id)

    def get_many(self, candidate_ids: list[str]) -> list[dict]:
        return [self.candidates[cid] for cid in candidate_ids if cid in self.candidates]

    def all(self) -> list[dict]:
        return list(self.candidates.values())

    def search_vectors(self, vector, top_k: int) -> list[tuple[str, float]]:
        return self.vector_store.search(vector, top_k)

    @property
    def count(self) -> int:
        return len(self.candidates)


# Module-level singleton, initialized at startup (see main.py lifespan).
candidate_store = CandidateStore()
