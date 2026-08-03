"""
POST /ai/jobs/parse -- turn a free-text job description into structured
search intent, reusing the Candidate Search Agent's query understanding
(the same LLM call that powers /ai/search's query parsing).

POST /ai/jobs/score -- deterministic candidate-vs-job scoring, reusing the
Ranking Agent (pure Python, no LLM call). Takes the candidate dict directly
rather than a candidate_id because scoring happens right after /ai/parse,
before the candidate has been written to the in-process candidate store via
/ai/index.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from agents.ranking_agent import score_candidate
from agents.search_agent import parse_query
from models.job import JobParseRequest, JobScoreRequest, JobScoreResponse
from models.search import SearchIntent, SubScores

logger = logging.getLogger("ai-service.routers.jobs")

router = APIRouter()


@router.post("/jobs/parse", response_model=SearchIntent, response_model_by_alias=True)
async def parse_job_description(payload: JobParseRequest) -> SearchIntent:
    try:
        intent = parse_query(payload.description)
    except Exception:
        logger.exception("Job description parsing failed")
        raise HTTPException(status_code=502, detail="Job description parsing (LLM) step failed.")
    return SearchIntent(**intent)


@router.post("/jobs/score", response_model=JobScoreResponse, response_model_by_alias=True)
async def score_candidate_for_job(payload: JobScoreRequest) -> JobScoreResponse:
    intent_dict = payload.intent.model_dump(by_alias=True)
    result = score_candidate(intent_dict, payload.candidate)
    return JobScoreResponse(match_score=result["matchScore"], breakdown=SubScores(**result["subScores"]))
