"""
Thin wrapper around a local (embedded, file-based, no server) Qdrant
collection, keeping the same public interface the old FAISS-backed
`VectorStore` had so `services/candidate_store.py` didn't need to change
beyond how it constructs this class.

"Local mode" (`QdrantClient(path=...)`) is a real, SQLite-backed Qdrant
instance with no Docker/server process required -- the same zero-install
philosophy as this project's `pgserver`-based local Postgres fallback (see
scripts/start_local_db.py). Writes commit synchronously, so there is no
separate save/flush step.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from qdrant_client import QdrantClient, models

from core.embeddings import EMBEDDING_DIM

logger = logging.getLogger("ai-service.vector_store")

COLLECTION_NAME = "candidates"


class VectorStore:
    def __init__(self, storage_dir: Path, collection_name: str = COLLECTION_NAME, dim: int = EMBEDDING_DIM):
        self.storage_dir = storage_dir
        self.collection_name = collection_name
        self.dim = dim
        self.client: QdrantClient | None = None

    def load(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.client = QdrantClient(path=str(self.storage_dir))
        if not self.client.collection_exists(self.collection_name):
            self.client.create_collection(
                self.collection_name,
                vectors_config=models.VectorParams(size=self.dim, distance=models.Distance.COSINE),
            )
        logger.info("Loaded Qdrant collection '%s' with %d vectors.", self.collection_name, self.count)

    def save(self) -> None:
        # Local-mode Qdrant commits every write synchronously -- nothing to
        # flush. Kept as a no-op so call sites elsewhere don't need to change.
        pass

    def upsert(self, candidate_id: str, vector: np.ndarray) -> None:
        """Add a new vector, or replace the vector for an existing id."""
        self.client.upsert(
            self.collection_name,
            points=[models.PointStruct(id=candidate_id, vector=np.asarray(vector, dtype="float32").tolist())],
        )

    def remove(self, candidate_id: str) -> bool:
        existed = bool(self.client.retrieve(self.collection_name, ids=[candidate_id]))
        if existed:
            self.client.delete(self.collection_name, points_selector=[candidate_id])
        return existed

    def rebuild_from(self, ids: list[str], vectors: np.ndarray) -> None:
        """Fully rebuild the collection from a fresh set of (ids, vectors).

        Deliberately does NOT delete_collection()+create_collection(): local
        mode was observed (via a throwaway smoke test) to leave old points
        queryable afterwards on the same client instance -- likely a stale
        in-memory collection handle inside qdrant-client's local backend, not
        something documented to rely on. Clearing via explicit point deletes
        uses the same primitives already verified correct by upsert/remove.
        """
        existing_ids = self.ids
        if existing_ids:
            self.client.delete(self.collection_name, points_selector=existing_ids)
        if len(ids):
            points = [
                models.PointStruct(id=cid, vector=np.asarray(vec, dtype="float32").tolist())
                for cid, vec in zip(ids, vectors)
            ]
            self.client.upsert(self.collection_name, points=points)

    def search(self, vector: np.ndarray, top_k: int) -> list[tuple[str, float]]:
        if self.count == 0:
            return []
        hits = self.client.query_points(
            self.collection_name,
            query=np.asarray(vector, dtype="float32").tolist(),
            limit=top_k,
        ).points
        return [(str(hit.id), float(hit.score)) for hit in hits]

    @property
    def ids(self) -> list[str]:
        all_ids: list[str] = []
        offset = None
        while True:
            records, offset = self.client.scroll(
                self.collection_name, limit=256, offset=offset, with_payload=False, with_vectors=False
            )
            all_ids.extend(str(r.id) for r in records)
            if offset is None:
                break
        return all_ids

    @property
    def count(self) -> int:
        return self.client.count(self.collection_name).count
