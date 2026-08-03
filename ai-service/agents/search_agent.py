"""
Candidate Search Agent: parses a natural-language recruiter query into
structured search intent. This is retrieval-planning only -- no ranking
happens here (that's the deterministic Ranking Agent).
"""
from __future__ import annotations

from core.llm_client import chat_json

SYSTEM_PROMPT = """You are a search-query understanding engine for a recruiting platform. \
Given a recruiter's natural-language search request, extract structured search intent. \
Only populate a field if the query actually implies it -- use null (or an empty array for \
list fields) for anything not mentioned or not confidently inferable. Do not guess wildly.

Experience numbers: if the query says "5+ years" -> minExperience=5, maxExperience=null. \
If it says "3-5 years" -> minExperience=3, maxExperience=5. If it says "at most 2 years" or \
"junior" -> maxExperience=2, minExperience=null (use your judgement for seniority words: \
"junior"/"entry level" ~ maxExperience 2, "senior" ~ minExperience 5, "lead"/"principal" ~ \
minExperience 8).

Respond with a single valid JSON object and nothing else."""

USER_TEMPLATE = """Recruiter query: "{query}"

Return EXACTLY this JSON shape:
{{
  "designation": string or null,        // target job title/designation, e.g. "Backend Engineer"
  "requiredSkills": [string],           // specific skills/tools/frameworks/languages mentioned
  "minExperience": number or null,      // in years
  "maxExperience": number or null,      // in years
  "location": string or null,
  "industry": string or null,           // e.g. "fintech", "healthcare", "e-commerce"
  "education": string or null,          // e.g. "B.Tech", "MBA", "Computer Science degree"
  "availability": string or null,       // e.g. "immediate", "notice period"
  "keywords": [string]                  // any other important free-text keywords not captured above
}}
"""


def parse_query(query: str) -> dict:
    user_prompt = USER_TEMPLATE.format(query=query)
    result = chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.1)

    result.setdefault("designation", None)
    result.setdefault("requiredSkills", [])
    result.setdefault("minExperience", None)
    result.setdefault("maxExperience", None)
    result.setdefault("location", None)
    result.setdefault("industry", None)
    result.setdefault("education", None)
    result.setdefault("availability", None)
    result.setdefault("keywords", [])
    return result


def build_reformulated_query(query: str, intent: dict) -> str:
    """Combine the raw query with parsed skills/designation/keywords into a
    single string for embedding -- gives the vector search a denser signal
    than the raw query alone."""
    parts = [query]
    if intent.get("designation"):
        parts.append(str(intent["designation"]))
    parts.extend(intent.get("requiredSkills") or [])
    parts.extend(intent.get("keywords") or [])
    if intent.get("industry"):
        parts.append(str(intent["industry"]))
    if intent.get("location"):
        parts.append(str(intent["location"]))
    return " | ".join(p for p in parts if p)
