"""
Analytics Agent: deterministic aggregate/statistical queries over the FULL
candidate knowledge base (services/candidate_store.py's entire in-memory
pool), not just a single query's vector-search shortlist.

This backs "how many candidates know Python", "what's the average
experience for the DevOps job", "what are our most common skills" style HR
questions -- questions a ranked search literally cannot answer, since a
search only ever returns its top-K matches, never a count or a statistic
over the whole pool.

Like ranking_agent, this is plain Python, not an LLM call -- the numbers
here are exact. The LLM's only job (see rag/prompt_builder.py's
build_analytics_user_prompt) is to phrase them, never to (re)compute them.
"""
from __future__ import annotations

import statistics
from collections import Counter

from agents.ranking_agent import _canonical, _location_canon, _normalize, _term_match_credit


def _candidate_skill_terms(candidate: dict) -> tuple[set[str], set[str]]:
    skills = candidate.get("skills") or {}
    raw = list(skills.get("primary") or []) + list(skills.get("secondary") or [])
    raw += list(candidate.get("technologyStack") or [])
    norms = {_normalize(s) for s in raw if s}
    canons = {_canonical(n) for n in norms}
    return norms, canons


def _has_skill(candidate: dict, skill: str) -> bool:
    norms, canons = _candidate_skill_terms(candidate)
    return _term_match_credit(skill, norms, canons) >= 1.0


def _matches_designation(candidate: dict, designation: str) -> bool:
    target = _normalize(designation)
    if not target:
        return True
    role = _normalize(candidate.get("currentRole") or "")
    if target in role or role in target:
        return True
    for suitable in candidate.get("suitableRoles") or []:
        s = _normalize(suitable)
        if target in s or s in target:
            return True
    return False


def _matches_location(candidate: dict, location: str) -> bool:
    target = _location_canon(location)
    if not target:
        return True
    cand = _location_canon(candidate.get("location") or "")
    if not cand:
        return False
    return target == cand or target in cand or cand in target


def _matches_availability(candidate: dict, availability: str) -> bool:
    target = (availability or "").strip().lower()
    if not target:
        return True
    cand = (candidate.get("availability") or "").strip().lower()
    if "immediate" in target:
        return "immediate" in cand
    return target in cand


def filter_candidates(
    candidates: list[dict],
    *,
    skills: list[str] | None = None,
    designation: str | None = None,
    location: str | None = None,
    availability: str | None = None,
    min_experience: float | None = None,
    max_experience: float | None = None,
    job_title: str | None = None,
) -> list[dict]:
    """Every provided filter must match (AND) -- unset filters pass everything
    through unchanged, so a question with no real filter criteria (e.g. "how
    many candidates do we have") just returns the full input list."""
    result = candidates
    if skills:
        result = [c for c in result if all(_has_skill(c, s) for s in skills)]
    if designation:
        result = [c for c in result if _matches_designation(c, designation)]
    if location:
        result = [c for c in result if _matches_location(c, location)]
    if availability:
        result = [c for c in result if _matches_availability(c, availability)]
    if min_experience is not None:
        result = [c for c in result if (c.get("totalExperienceYears") or 0) >= min_experience]
    if max_experience is not None:
        result = [c for c in result if (c.get("totalExperienceYears") or 0) <= max_experience]
    if job_title:
        target = _normalize(job_title)
        result = [c for c in result if target and target in _normalize(c.get("jobTitle") or "")]
    return result


def compute_summary_stats(candidates: list[dict], top_n: int = 10) -> dict:
    """Aggregate statistics over a candidate set: counts, experience
    distribution, and the most common skills/roles/locations/availability/
    jobs. Every number here is computed directly, never estimated."""
    total = len(candidates)
    if total == 0:
        return {"total": 0}

    experience_years = [c.get("totalExperienceYears") or 0 for c in candidates]
    skill_counter: Counter[str] = Counter()
    role_counter: Counter[str] = Counter()
    location_counter: Counter[str] = Counter()
    availability_counter: Counter[str] = Counter()
    job_counter: Counter[str] = Counter()

    for c in candidates:
        skills = c.get("skills") or {}
        for s in list(skills.get("primary") or [])[:10]:
            if s:
                skill_counter[s] += 1
        if c.get("currentRole"):
            role_counter[c["currentRole"]] += 1
        if c.get("location"):
            location_counter[c["location"]] += 1
        availability_counter[c.get("availability") or "Not Specified"] += 1
        if c.get("jobTitle"):
            job_counter[c["jobTitle"]] += 1

    return {
        "total": total,
        "averageExperienceYears": round(statistics.mean(experience_years), 1),
        "medianExperienceYears": round(statistics.median(experience_years), 1),
        "minExperienceYears": round(min(experience_years), 1),
        "maxExperienceYears": round(max(experience_years), 1),
        "topSkills": skill_counter.most_common(top_n),
        "topRoles": role_counter.most_common(top_n),
        "topLocations": location_counter.most_common(top_n),
        "availabilityBreakdown": availability_counter.most_common(),
        "jobBreakdown": job_counter.most_common(top_n),
    }
