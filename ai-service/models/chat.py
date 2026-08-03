from __future__ import annotations

from pydantic import Field

from models.candidate import CamelModel, CandidateSummary


class ChatRequest(CamelModel):
    session_id: str | None = None
    message: str


class ChatResponse(CamelModel):
    session_id: str
    reply: str
    suggestions: list[str] = Field(default_factory=list)
    candidate_ids: list[str] = Field(default_factory=list)
    candidates: list[CandidateSummary] = Field(default_factory=list)
