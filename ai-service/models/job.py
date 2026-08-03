"""Request/response shapes for POST /ai/jobs/parse and POST /ai/jobs/score."""
from __future__ import annotations

from models.candidate import CamelModel
from models.search import SearchIntent, SubScores


class JobParseRequest(CamelModel):
    description: str


class JobScoreRequest(CamelModel):
    # The full parsed-candidate dict (as returned by POST /ai/parse), not yet
    # written to the in-process candidate store -- kept as a plain dict
    # rather than re-declaring the whole Candidate model, since
    # ranking_agent.score_candidate only ever reads it via .get().
    candidate: dict
    intent: SearchIntent


class JobScoreResponse(CamelModel):
    match_score: float = 0.0
    breakdown: SubScores
