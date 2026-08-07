"""
GET /ai/analytics -- aggregate statistics over the whole candidate pool,
for a direct dashboard view. Reuses the same deterministic Analytics Agent
(agents/analytics_agent.py) already powering the chatbot's "how many
candidates know Python" style questions -- no LLM call, pure Python.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from agents.analytics_agent import compute_summary_stats
from models.analytics import AnalyticsResponse
from services.candidate_store import candidate_store

logger = logging.getLogger("ai-service.routers.analytics")

router = APIRouter()


@router.get("/analytics", response_model=AnalyticsResponse, response_model_by_alias=True)
async def get_analytics() -> AnalyticsResponse:
    try:
        stats = compute_summary_stats(candidate_store.all())
    except Exception:
        logger.exception("Failed to compute analytics summary")
        raise HTTPException(status_code=500, detail="Failed to compute analytics.")
    return AnalyticsResponse(**stats)
