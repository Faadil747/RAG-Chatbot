from __future__ import annotations

from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from models.candidate import CamelModel, CandidateSummary


class SearchIntent(CamelModel):
    """Structured intent parsed from a natural-language recruiter query
    by the Candidate Search Agent. All fields are optional -- the LLM
    returns null for anything it can't confidently infer."""

    designation: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    min_experience: float | None = None
    max_experience: float | None = None
    location: str | None = None
    industry: str | None = None
    education: str | None = None
    availability: str | None = None
    keywords: list[str] = Field(default_factory=list)


class SubScores(CamelModel):
    skill_match: float = 0.0
    experience_match: float = 0.0
    designation_match: float = 0.0
    industry_match: float = 0.0
    education_match: float = 0.0
    technology_match: float = 0.0
    freshness_score: float = 0.0


class Justification(CamelModel):
    """Grounded, LLM-generated rationale for why a candidate matches a query.
    `extra="ignore"` (inherited from CamelModel) means the richer dict the
    Recommendation Agent actually returns internally (which also carries
    `interviewQuestions` for the chat flow) validates fine here -- only
    these five contract fields survive onto the wire."""

    matching_skills: list[str] = Field(default_factory=list)
    relevant_experience: str = ""
    strong_points: list[str] = Field(default_factory=list)
    potential_concerns: list[str] = Field(default_factory=list)
    recommendation: str = ""


class SearchResult(CamelModel):
    candidate_id: str
    rank: int
    candidate: CandidateSummary
    match_score: float = 0.0
    breakdown: SubScores
    justification: Justification | None = None


class SearchRequest(CamelModel):
    query: str
    top_k: int = 10


class SearchResponse(CamelModel):
    query: str
    total_matches: int
    results: list[SearchResult]


class SearchAnalysisRequest(CamelModel):
    query: str
    candidate_id: str


class IndexRequest(CamelModel):
    """Accepts the full Candidate JSON, plus an optional uploadedAt the
    backend supplies (defaults to "now" if absent). `extra="allow"` because
    this model intentionally passes through the entire candidate payload,
    not just the two fields it explicitly declares."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="allow",
    )

    id: str
    uploaded_at: str | None = None


class IndexResponse(CamelModel):
    indexed: bool
    candidate_id: str


class DeleteIndexResponse(CamelModel):
    removed: bool


class HealthResponse(CamelModel):
    status: str
    candidates_indexed: int
