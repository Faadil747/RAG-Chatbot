"""
The shared natural-language candidate search pipeline used by both
POST /ai/search and the "new search" path inside POST /ai/chat.

Pipeline: Candidate Search Agent (query -> structured intent) -> embed a
reformulated query -> Qdrant shortlist -> deterministic Ranking Agent ->
Recommendation Agent for ranks 1-3.
"""
from __future__ import annotations

import asyncio
import logging

from agents.ranking_agent import rank_candidates
from agents.recommendation_agent import analyze_candidate
from agents.search_agent import build_reformulated_query, parse_query
from core.embeddings import QUERY_PREFIX, embed_text
from models.candidate import candidate_to_summary
from services.candidate_store import candidate_store

logger = logging.getLogger("ai-service.search_pipeline")

SHORTLIST_SIZE = 30
TOP_JUSTIFICATION_COUNT = 3


async def run_search(query: str, top_k: int = 10, with_justifications: bool = True) -> dict:
    """Returns {"query", "intent", "totalMatches", "results": [...], "candidateIds": [...]}.

    `with_justifications` gates the Recommendation Agent pass over ranks 1-3
    (3 extra LLM calls). POST /ai/search needs it to populate the UI's
    justification cards. The chat pipeline's internal "new search" retrieval
    doesn't -- build_chat_user_prompt only reads base candidate fields +
    matchScore, so callers there should pass False to skip the cost.
    """
    intent = parse_query(query)

    reformulated = build_reformulated_query(query, intent)
    query_vector = embed_text(reformulated, prefix=QUERY_PREFIX)

    shortlist_hits = candidate_store.search_vectors(query_vector, SHORTLIST_SIZE)
    shortlist_ids = [cid for cid, _score in shortlist_hits]
    shortlist_candidates = candidate_store.get_many(shortlist_ids)

    if not shortlist_candidates:
        return {
            "query": query,
            "intent": intent,
            "totalMatches": 0,
            "results": [],
            "candidateIds": [],
        }

    ranked = rank_candidates(intent, shortlist_candidates, top_k)

    if with_justifications:
        # Run the Recommendation Agent concurrently for ranks 1-3.
        async def _justify(candidate: dict) -> dict:
            return await asyncio.to_thread(analyze_candidate, candidate, query, "general")

        justification_tasks = []
        for entry in ranked[:TOP_JUSTIFICATION_COUNT]:
            candidate_for_analysis = dict(entry["candidate"])
            candidate_for_analysis["matchScore"] = entry["matchScore"]
            candidate_for_analysis["subScores"] = entry["subScores"]
            justification_tasks.append(_justify(candidate_for_analysis))
        justifications = await asyncio.gather(*justification_tasks) if justification_tasks else []
    else:
        justifications = []

    results = []
    for i, entry in enumerate(ranked):
        candidate = entry["candidate"]
        justification = justifications[i] if i < len(justifications) else None
        results.append(
            {
                "candidateId": candidate["id"],
                "rank": i + 1,
                "candidate": candidate_to_summary(candidate),
                "matchScore": entry["matchScore"],
                "breakdown": entry["subScores"],
                "justification": justification,
            }
        )

    return {
        "query": query,
        "intent": intent,
        "totalMatches": len(shortlist_candidates),
        "results": results,
        "candidateIds": [r["candidate"]["id"] for r in results],
    }
