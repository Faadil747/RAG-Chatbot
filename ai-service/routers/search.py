"""POST /ai/search and POST /ai/search/analysis."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from agents.recommendation_agent import analyze_candidate
from models.search import Justification, SearchAnalysisRequest, SearchRequest, SearchResponse
from services.candidate_store import candidate_store
from services.search_pipeline import run_search

logger = logging.getLogger("ai-service.routers.search")

router = APIRouter()


@router.post("/search", response_model=SearchResponse, response_model_by_alias=True)
async def search_candidates(payload: SearchRequest) -> SearchResponse:
    try:
        result = await run_search(payload.query, payload.top_k)
    except Exception:
        logger.exception("Search pipeline failed for query=%r", payload.query)
        raise HTTPException(status_code=502, detail="Candidate search failed.")

    return SearchResponse(
        query=result["query"],
        total_matches=result["totalMatches"],
        results=result["results"],
    )


@router.post("/search/analysis", response_model=Justification, response_model_by_alias=True)
async def search_analysis(payload: SearchAnalysisRequest) -> Justification:
    candidate = candidate_store.get(payload.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail=f"Candidate '{payload.candidate_id}' not found.")

    try:
        justification = await asyncio.to_thread(analyze_candidate, candidate, payload.query, "general")
    except Exception:
        logger.exception("Recommendation Agent failed for candidate=%s", payload.candidate_id)
        raise HTTPException(status_code=502, detail="Candidate analysis failed.")

    return Justification(**justification)
