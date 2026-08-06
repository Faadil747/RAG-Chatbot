from __future__ import annotations

from pydantic import Field

from models.candidate import CamelModel, CandidateSummary
from models.search import SearchResult


class ChatRequest(CamelModel):
    session_id: str | None = None
    message: str


class ChatResponse(CamelModel):
    session_id: str
    reply: str
    suggestions: list[str] = Field(default_factory=list)
    candidate_ids: list[str] = Field(default_factory=list)
    candidates: list[CandidateSummary] = Field(default_factory=list)
    # Populated only when this turn ran a fresh ranked search (as opposed to
    # a follow-up about already-discussed candidates): the same
    # rank/matchScore/breakdown/justification shape POST /ai/search returns,
    # so the frontend can render chat results with the identical
    # top-3-with-justification card used on the Search page. `query` is the
    # search text those results were ranked against (needed for the
    # frontend's on-demand "Generate AI Analysis" call for ranks 4+).
    query: str | None = None
    results: list[SearchResult] = Field(default_factory=list)
