"""
Thin wrapper around a FAISS `IndexFlatIP` (cosine similarity over normalized
vectors) persisted to disk, with a parallel ordered id list so FAISS row
indices can be mapped back to candidate UUIDs.

This is intentionally a "dumb" flat index -- correct and simple, not the
most scalable. Deletion is handled by reconstructing the surviving vectors
straight out of the flat index (which stores full vectors, so
`index.reconstruct` works without needing to re-embed anything) and
rebuilding a fresh index from them, per the spec's "rebuild from remaining
entries" approach.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import faiss
import numpy as np

from core.embeddings import EMBEDDING_DIM

logger = logging.getLogger("ai-service.vector_store")


class VectorStore:
    def __init__(self, index_path: Path, ids_path: Path, dim: int = EMBEDDING_DIM):
        self.index_path = index_path
        self.ids_path = ids_path
        self.dim = dim
        self.index: faiss.IndexFlatIP = faiss.IndexFlatIP(dim)
        self.ids: list[str] = []

    def load(self) -> None:
        if self.index_path.exists() and self.ids_path.exists():
            try:
                self.index = faiss.read_index(str(self.index_path))
                with open(self.ids_path, "r", encoding="utf-8") as f:
                    self.ids = json.load(f)
                if self.index.ntotal != len(self.ids):
                    logger.warning(
                        "FAISS index/id-list size mismatch (%d vs %d); resetting.",
                        self.index.ntotal, len(self.ids),
                    )
                    self._reset()
                else:
                    logger.info("Loaded FAISS index with %d vectors.", self.index.ntotal)
                return
            except Exception:
                logger.exception("Failed to load existing FAISS index; starting fresh.")
        self._reset()

    def _reset(self) -> None:
        self.index = faiss.IndexFlatIP(self.dim)
        self.ids = []

    def save(self) -> None:
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(self.index_path))
        with open(self.ids_path, "w", encoding="utf-8") as f:
            json.dump(self.ids, f)

    def _all_vectors(self) -> np.ndarray:
        n = self.index.ntotal
        if n == 0:
            return np.zeros((0, self.dim), dtype="float32")
        return self.index.reconstruct_n(0, n)

    def upsert(self, candidate_id: str, vector: np.ndarray) -> None:
        """Add a new vector, or replace the vector for an existing id."""
        vector = np.asarray(vector, dtype="float32").reshape(1, -1)
        if candidate_id in self.ids:
            # Replace: rebuild from the surviving + new vector.
            existing = self._all_vectors()
            keep_mask = [i for i, cid in enumerate(self.ids) if cid != candidate_id]
            kept_vectors = existing[keep_mask] if keep_mask else np.zeros((0, self.dim), dtype="float32")
            kept_ids = [self.ids[i] for i in keep_mask]

            new_index = faiss.IndexFlatIP(self.dim)
            if len(kept_vectors):
                new_index.add(kept_vectors)
            new_index.add(vector)

            self.index = new_index
            self.ids = kept_ids + [candidate_id]
        else:
            self.index.add(vector)
            self.ids.append(candidate_id)

    def remove(self, candidate_id: str) -> bool:
        """Rebuild the index from all vectors except candidate_id. True if removed."""
        if candidate_id not in self.ids:
            return False

        existing = self._all_vectors()
        keep_mask = [i for i, cid in enumerate(self.ids) if cid != candidate_id]
        kept_vectors = existing[keep_mask] if keep_mask else np.zeros((0, self.dim), dtype="float32")
        kept_ids = [self.ids[i] for i in keep_mask]

        new_index = faiss.IndexFlatIP(self.dim)
        if len(kept_vectors):
            new_index.add(kept_vectors)

        self.index = new_index
        self.ids = kept_ids
        return True

    def rebuild_from(self, ids: list[str], vectors: np.ndarray) -> None:
        """Fully rebuild the index from a fresh set of (ids, vectors)."""
        new_index = faiss.IndexFlatIP(self.dim)
        if len(vectors):
            new_index.add(np.asarray(vectors, dtype="float32"))
        self.index = new_index
        self.ids = list(ids)

    def search(self, vector: np.ndarray, top_k: int) -> list[tuple[str, float]]:
        if self.index.ntotal == 0:
            return []
        vector = np.asarray(vector, dtype="float32").reshape(1, -1)
        k = min(top_k, self.index.ntotal)
        scores, indices = self.index.search(vector, k)
        results: list[tuple[str, float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            results.append((self.ids[idx], float(score)))
        return results

    @property
    def count(self) -> int:
        return self.index.ntotal
