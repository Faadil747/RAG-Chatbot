"""Response shape for GET /ai/analytics -- mirrors the dict returned by
agents/analytics_agent.py's compute_summary_stats()."""
from __future__ import annotations

from pydantic import Field

from models.candidate import CamelModel


class AnalyticsResponse(CamelModel):
    total: int = 0
    average_experience_years: float | None = None
    median_experience_years: float | None = None
    min_experience_years: float | None = None
    max_experience_years: float | None = None
    top_skills: list[tuple[str, int]] = Field(default_factory=list)
    top_roles: list[tuple[str, int]] = Field(default_factory=list)
    top_locations: list[tuple[str, int]] = Field(default_factory=list)
    availability_breakdown: list[tuple[str, int]] = Field(default_factory=list)
    job_breakdown: list[tuple[str, int]] = Field(default_factory=list)
