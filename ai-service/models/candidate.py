"""
The shared Candidate JSON contract. Field names below are snake_case (idiomatic
Python) but every model uses `alias_generator=to_camel` + `populate_by_name=True`
so that (a) JSON in/out is camelCase per the contract, and (b) we can still
construct/access models using either the Python name or the camelCase alias.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class Skills(CamelModel):
    primary: list[str] = Field(default_factory=list)
    secondary: list[str] = Field(default_factory=list)


class ExperienceItem(CamelModel):
    company: str = ""
    role: str = ""
    start_date: str = ""
    end_date: str = ""
    duration_months: int = 0
    description: str = ""


class EducationItem(CamelModel):
    institution: str = ""
    degree: str = ""
    field: str = ""
    year: str = ""


class ProjectItem(CamelModel):
    name: str = ""
    description: str = ""
    tech_stack: list[str] = Field(default_factory=list)


class Candidate(CamelModel):
    id: str
    name: str = ""
    email: str = ""
    phone: str = ""
    current_role: str = ""
    location: str = ""
    linkedin: str | None = None
    github: str | None = None
    portfolio: str | None = None
    total_experience_years: float = 0.0
    availability: str = "Not Specified"
    overall_rating: int = 0
    skills: Skills = Field(default_factory=Skills)
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    previous_companies: list[str] = Field(default_factory=list)
    ai_summary: str = ""
    career_highlights: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    suitable_roles: list[str] = Field(default_factory=list)
    technology_stack: list[str] = Field(default_factory=list)
    resume_text: str = ""


class CandidateSummary(CamelModel):
    id: str
    name: str = ""
    current_role: str = ""
    total_experience_years: float = 0.0
    location: str = ""
    top_skills: list[str] = Field(default_factory=list)
    ai_summary: str = ""
    overall_rating: int = 0
    uploaded_at: str = ""
    availability: str = "Not Specified"


def candidate_to_summary(candidate: dict) -> dict:
    """Build a CandidateSummary-shaped dict from a full candidate dict
    (both already in camelCase form, e.g. as loaded from candidates_store.json)."""
    skills = candidate.get("skills") or {}
    top_skills = list((skills.get("primary") or []))[:8]
    return {
        "id": candidate.get("id"),
        "name": candidate.get("name", ""),
        "currentRole": candidate.get("currentRole", ""),
        "totalExperienceYears": candidate.get("totalExperienceYears", 0.0),
        "location": candidate.get("location", ""),
        "topSkills": top_skills,
        "aiSummary": candidate.get("aiSummary", ""),
        "overallRating": candidate.get("overallRating", 0),
        "uploadedAt": candidate.get("uploadedAt", ""),
        "availability": candidate.get("availability", "Not Specified"),
    }
