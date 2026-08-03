"""
Ranking Agent: deterministic Python scoring, NOT an LLM call.

Computes 0-100 sub-scores per candidate against the parsed search intent,
then blends them into a single `matchScore` via a fixed weighted average.
Weights are named constants (skill/tech/designation weighted highest,
freshness weighted lowest) so the ranking logic is transparent and testable.
"""
from __future__ import annotations

import difflib
import re
from datetime import datetime, timezone

# -- weights (must sum to 1.0) ----------------------------------------------

SKILL_MATCH_WEIGHT = 0.22
DESIGNATION_MATCH_WEIGHT = 0.18
TECHNOLOGY_MATCH_WEIGHT = 0.18
EXPERIENCE_MATCH_WEIGHT = 0.15
INDUSTRY_MATCH_WEIGHT = 0.12
EDUCATION_MATCH_WEIGHT = 0.10
FRESHNESS_WEIGHT = 0.05

_NEUTRAL_SCORE = 50.0  # used when the intent doesn't constrain a dimension


def _normalize(term: str) -> str:
    return re.sub(r"[^a-z0-9+#.]", "", term.lower())


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]+", (text or "").lower()))


def _skill_overlap_score(required: list[str], candidate_skills: list[str]) -> float:
    if not required:
        return _NEUTRAL_SCORE
    normalized_candidate = {_normalize(s) for s in candidate_skills}
    matched = 0
    for req in required:
        norm_req = _normalize(req)
        if not norm_req:
            continue
        if norm_req in normalized_candidate:
            matched += 1
            continue
        # partial/substring credit, e.g. "react" matches "reactjs"
        if any(norm_req in cs or cs in norm_req for cs in normalized_candidate if cs):
            matched += 0.6
    return round(min(100.0, (matched / len(required)) * 100), 1)


def _experience_match_score(
    min_experience: float | None, max_experience: float | None, candidate_years: float
) -> float:
    if min_experience is None and max_experience is None:
        return _NEUTRAL_SCORE

    lo = min_experience if min_experience is not None else 0.0
    hi = max_experience if max_experience is not None else float("inf")

    if lo <= candidate_years <= hi:
        return 100.0

    distance = (lo - candidate_years) if candidate_years < lo else (candidate_years - hi)
    distance = max(0.0, distance)
    score = 100.0 - distance * 15.0
    return round(max(0.0, min(100.0, score)), 1)


def _designation_match_score(designation: str | None, current_role: str, suitable_roles: list[str]) -> float:
    if not designation:
        return _NEUTRAL_SCORE

    target = designation.lower().strip()
    candidates_to_check = [current_role or ""] + list(suitable_roles or [])
    best_ratio = 0.0
    for role in candidates_to_check:
        role_l = (role or "").lower().strip()
        if not role_l:
            continue
        ratio = difflib.SequenceMatcher(None, target, role_l).ratio()
        # Boost if one is a substring of the other (e.g. "engineer" in "software engineer")
        if target in role_l or role_l in target:
            ratio = max(ratio, 0.85)
        best_ratio = max(best_ratio, ratio)
    return round(best_ratio * 100, 1)


def _keyword_overlap_score(query_terms: list[str] | str | None, haystack_texts: list[str]) -> float:
    if not query_terms:
        return _NEUTRAL_SCORE
    if isinstance(query_terms, str):
        query_tokens = _tokenize(query_terms)
    else:
        query_tokens = set()
        for term in query_terms:
            query_tokens |= _tokenize(term)
    if not query_tokens:
        return _NEUTRAL_SCORE

    haystack_tokens: set[str] = set()
    for text in haystack_texts:
        haystack_tokens |= _tokenize(text)

    if not haystack_tokens:
        return 0.0

    overlap = query_tokens & haystack_tokens
    return round(min(100.0, (len(overlap) / len(query_tokens)) * 100), 1)


def _technology_match_score(required_skills: list[str], keywords: list[str], technology_stack: list[str]) -> float:
    terms = list(required_skills or []) + list(keywords or [])
    if not terms:
        return _NEUTRAL_SCORE
    normalized_stack = {_normalize(t) for t in technology_stack}
    matched = 0
    for term in terms:
        norm_term = _normalize(term)
        if not norm_term:
            continue
        if norm_term in normalized_stack or any(norm_term in t or t in norm_term for t in normalized_stack if t):
            matched += 1
    return round(min(100.0, (matched / len(terms)) * 100), 1)


def _freshness_score(uploaded_at: str | None) -> float:
    if not uploaded_at:
        return 25.0
    try:
        uploaded = datetime.fromisoformat(uploaded_at.replace("Z", "+00:00"))
        if uploaded.tzinfo is None:
            uploaded = uploaded.replace(tzinfo=timezone.utc)
    except ValueError:
        return 25.0

    age_days = (datetime.now(timezone.utc) - uploaded).days
    if age_days <= 30:
        return 100.0
    if age_days <= 60:
        return 75.0
    if age_days <= 90:
        return 50.0
    return 25.0


def score_candidate(intent: dict, candidate: dict) -> dict:
    """Compute all sub-scores + the blended matchScore for one candidate
    against the parsed search intent. Returns a dict with subScores + matchScore."""
    skills = candidate.get("skills") or {}
    candidate_skills = list(skills.get("primary") or []) + list(skills.get("secondary") or [])

    required_skills = intent.get("requiredSkills") or []

    skill_match = _skill_overlap_score(required_skills, candidate_skills)
    experience_match = _experience_match_score(
        intent.get("minExperience"), intent.get("maxExperience"), candidate.get("totalExperienceYears", 0.0)
    )
    designation_match = _designation_match_score(
        intent.get("designation"), candidate.get("currentRole", ""), candidate.get("suitableRoles") or []
    )

    industry_haystack = list(candidate.get("previousCompanies") or [])
    industry_haystack += [e.get("description", "") for e in (candidate.get("experience") or [])]
    industry_query = intent.get("industry") or (intent.get("keywords") or [])
    industry_match = _keyword_overlap_score(industry_query, industry_haystack)

    education_haystack = [
        f"{e.get('degree', '')} {e.get('field', '')} {e.get('institution', '')}"
        for e in (candidate.get("education") or [])
    ]
    education_match = _keyword_overlap_score(intent.get("education"), education_haystack)

    technology_match = _technology_match_score(
        required_skills, intent.get("keywords") or [], candidate.get("technologyStack") or []
    )

    freshness = _freshness_score(candidate.get("uploadedAt"))

    match_score = (
        skill_match * SKILL_MATCH_WEIGHT
        + designation_match * DESIGNATION_MATCH_WEIGHT
        + technology_match * TECHNOLOGY_MATCH_WEIGHT
        + experience_match * EXPERIENCE_MATCH_WEIGHT
        + industry_match * INDUSTRY_MATCH_WEIGHT
        + education_match * EDUCATION_MATCH_WEIGHT
        + freshness * FRESHNESS_WEIGHT
    )

    return {
        "subScores": {
            "skillMatch": skill_match,
            "experienceMatch": experience_match,
            "designationMatch": designation_match,
            "industryMatch": industry_match,
            "educationMatch": education_match,
            "technologyMatch": technology_match,
            "freshnessScore": freshness,
        },
        "matchScore": round(max(0.0, min(100.0, match_score)), 1),
    }


def rank_candidates(intent: dict, candidates: list[dict], top_k: int) -> list[dict]:
    """Score every candidate in the shortlist, sort descending by matchScore,
    return the top_k as [{"candidate": <dict>, "subScores": {...}, "matchScore": float}]."""
    scored = []
    for candidate in candidates:
        result = score_candidate(intent, candidate)
        scored.append({"candidate": candidate, **result})

    scored.sort(key=lambda r: r["matchScore"], reverse=True)
    return scored[:top_k]
