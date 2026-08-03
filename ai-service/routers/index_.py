"""
POST /ai/index and DELETE /ai/index/{candidate_id}.

Named `index_.py` (trailing underscore) to avoid shadowing the builtin
`index` name / any `index.py` ambiguity with package indexing tools.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from models.search import DeleteIndexResponse, IndexRequest, IndexResponse
from services.candidate_store import candidate_store

logger = logging.getLogger("ai-service.routers.index")

router = APIRouter()


@router.post("/index", response_model=IndexResponse, response_model_by_alias=True)
async def index_candidate(payload: IndexRequest) -> IndexResponse:
    candidate_id = payload.id
    uploaded_at = payload.uploaded_at

    # Store everything the backend sent (the full Candidate JSON) minus the
    # transient uploadedAt override, which candidate_store.upsert manages.
    full_payload = payload.model_dump(by_alias=True)
    candidate_payload = {k: v for k, v in full_payload.items() if k != "uploadedAt"}

    try:
        indexed_id = await candidate_store.upsert(candidate_payload, uploaded_at=uploaded_at)
    except Exception:
        logger.exception("Failed to index candidate %s", candidate_id)
        raise HTTPException(status_code=500, detail="Failed to index candidate.")

    return IndexResponse(indexed=True, candidate_id=indexed_id)


@router.delete("/index/{candidate_id}", response_model=DeleteIndexResponse, response_model_by_alias=True)
async def delete_candidate(candidate_id: str) -> DeleteIndexResponse:
    removed = await candidate_store.delete(candidate_id)
    return DeleteIndexResponse(removed=removed)
