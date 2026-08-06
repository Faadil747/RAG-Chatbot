"""
Ranking Agent: deterministic Python scoring, NOT an LLM call.

Computes 0-100 sub-scores per candidate against the parsed search/job intent,
then blends them into a single `matchScore` via a fixed weighted average.
This is the executable form of the criteria documented in
`docs/CANDIDATE_SCORING_CRITERIA.md` -- if you change a weight or formula
here, update that doc in the same change so it stays a true description of
what the system does.
"""
from __future__ import annotations

import difflib
import re
from datetime import datetime, timezone

# -- weights (must sum to 1.0) ----------------------------------------------
# See docs/CANDIDATE_SCORING_CRITERIA.md for the rationale behind each weight.

SKILL_MATCH_WEIGHT = 0.20
TECHNOLOGY_MATCH_WEIGHT = 0.14
DESIGNATION_MATCH_WEIGHT = 0.14
EXPERIENCE_MATCH_WEIGHT = 0.15
INDUSTRY_MATCH_WEIGHT = 0.09
EDUCATION_MATCH_WEIGHT = 0.08
LOCATION_MATCH_WEIGHT = 0.08
AVAILABILITY_MATCH_WEIGHT = 0.07
FRESHNESS_WEIGHT = 0.05

_NEUTRAL_SCORE = 50.0  # used when the intent doesn't constrain a dimension

# -- skill/technology term matching ------------------------------------------
#
# Required skills are matched against a candidate's skills using, in order:
#   1. Exact match (after normalization) -> full credit.
#   2. Known alias/synonym match (e.g. "js" == "javascript") -> full credit.
#   3. Close fuzzy match (typo-level, ratio >= 0.88) -> partial credit.
# Earlier versions used a raw substring check ("java" in "javascript") for
# partial credit, which silently matched unrelated skills that happen to
# share a prefix (Java/JavaScript, C/C++/C#, Go/Django, R/React...). That is
# a correctness bug, not a feature -- removed in favor of the alias table
# below plus whole-term fuzzy matching.
SKILL_ALIASES: dict[str, str] = {
    "js": "javascript", "javascript": "javascript",
    "ts": "typescript", "typescript": "typescript",
    "reactjs": "react", "react.js": "react", "react": "react",
    "nodejs": "node", "node.js": "node", "node": "node",
    "vuejs": "vue", "vue.js": "vue",
    "angularjs": "angular", "angular": "angular",
    "postgres": "postgresql", "postgresql": "postgresql", "psql": "postgresql",
    "mongo": "mongodb", "mongodb": "mongodb",
    "k8s": "kubernetes", "kubernetes": "kubernetes",
    "ml": "machinelearning", "machinelearning": "machinelearning",
    "ai": "artificialintelligence", "artificialintelligence": "artificialintelligence",
    "aws": "aws", "amazonwebservices": "aws",
    "gcp": "gcp", "googlecloud": "gcp", "googlecloudplatform": "gcp",
    "azure": "azure", "microsoftazure": "azure",
    "cicd": "cicd", "ci/cd": "cicd", "continuousintegration": "cicd",
    "restapi": "restapi", "restfulapi": "restapi", "rest": "restapi",
    "dotnet": "dotnet", ".net": "dotnet", "csharp": "csharp", "c#": "csharp",
    "golang": "go", "go": "go",
    "cpp": "cpp", "c++": "cpp",
    "powerbi": "powerbi", "power bi": "powerbi",
    "mssql": "mssql", "sqlserver": "mssql",
    "gitops": "git", "git": "git",
    "nextjs": "next", "next.js": "next",
    "expressjs": "express", "express.js": "express",
    "django": "django", "flask": "flask",
    "tensorflow": "tensorflow", "pytorch": "pytorch",
    "nlp": "naturallanguageprocessing",
    "sql": "sql",
}

# -- common Indian city name variants, so "Bangalore" and "Bengaluru" (or
# "Gurgaon"/"Gurugram", "Delhi"/"NCR", etc.) are treated as the same place
# instead of scoring a location mismatch.
CITY_ALIASES: dict[str, str] = {
    "bangalore": "bengaluru", "bengaluru": "bengaluru",
    "bombay": "mumbai", "mumbai": "mumbai",
    "madras": "chennai", "chennai": "chennai",
    "gurgaon": "gurugram", "gurugram": "gurugram",
    "newdelhi": "delhi", "delhi": "delhi", "delhincr": "delhi", "ncr": "delhi",
    "calcutta": "kolkata", "kolkata": "kolkata",
    "trivandrum": "thiruvananthapuram", "thiruvananthapuram": "thiruvananthapuram",
    "pondicherry": "puducherry", "puducherry": "puducherry",
    "cochin": "kochi", "kochi": "kochi",
    "poona": "pune", "pune": "pune",
}

_NOTICE_UNIT_DAYS = {"day": 1.0, "week": 7.0, "month": 30.0}


def _normalize(term: str) -> str:
    return re.sub(r"[^a-z0-9+#.]", "", term.lower())


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]+", (text or "").lower()))


def _canonical(norm_term: str) -> str:
    return SKILL_ALIASES.get(norm_term, norm_term)


def _unique_terms(terms: list[str]) -> list[str]:
    """Keep term order but remove exact/alias duplicates so repeated query
    terms don't distort a dimension's denominator or make the score look more
    confident than the evidence supports."""
    seen: set[str] = set()
    unique: list[str] = []
    for term in terms:
        norm = _normalize(term)
        if not norm:
            continue
        canon = _canonical(norm)
        if canon in seen:
            continue
        seen.add(canon)
        unique.append(term)
    return unique


def _term_match_credit(required_term: str, candidate_norms: set[str], candidate_canons: set[str]) -> float:
    """1.0 for an exact/alias match, 0.85 for a close fuzzy match (typos,
    minor formatting differences), 0.0 otherwise. Deliberately NOT a
    substring check -- see the module docstring above."""
    norm_req = _normalize(required_term)
    if not norm_req:
        return 0.0
    if norm_req in candidate_norms or _canonical(norm_req) in candidate_canons:
        return 1.0
    if len(norm_req) >= 4:
        best = 0.0
        for cn in candidate_norms:
            if len(cn) < 4:
                continue
            ratio = difflib.SequenceMatcher(None, norm_req, cn).ratio()
            if ratio > best:
                best = ratio
        if best >= 0.88:
            return 0.85
    return 0.0


def _skill_overlap_score(required: list[str], candidate_skills: list[str]) -> float:
    required = _unique_terms(required or [])
    if not required:
        return _NEUTRAL_SCORE
    candidate_norms = {_normalize(s) for s in candidate_skills if s}
    candidate_canons = {_canonical(n) for n in candidate_norms}
    matched = sum(_term_match_credit(req, candidate_norms, candidate_canons) for req in required)
    return round(min(100.0, (matched / len(required)) * 100), 1)


def _technology_match_score(required_skills: list[str], keywords: list[str], technology_stack: list[str]) -> float:
    terms = _unique_terms(list(required_skills or []) + list(keywords or []))
    if not terms:
        return _NEUTRAL_SCORE
    stack_norms = {_normalize(t) for t in technology_stack if t}
    stack_canons = {_canonical(n) for n in stack_norms}
    matched = sum(_term_match_credit(term, stack_norms, stack_canons) for term in terms)
    return round(min(100.0, (matched / len(terms)) * 100), 1)


def _experience_match_score(
    min_experience: float | None, max_experience: float | None, candidate_years: float
) -> float:
    if min_experience is None and max_experience is None:
        return _NEUTRAL_SCORE

    lo = min_experience if min_experience is not None else 0.0
    # For natural-language searches like "5+ years", the recruiter usually
    # means "at least senior enough", not "20 years is an equally perfect
    # match". Use a soft upper comfort band when no max is stated so heavily
    # over-qualified profiles don't all show 100% Experience Match.
    if max_experience is not None:
        hi = max_experience
    elif min_experience is not None:
        hi = min_experience + (2.0 if min_experience <= 2 else 5.0)
    else:
        hi = float("inf")

    if lo <= candidate_years <= hi:
        return 100.0

    distance = (lo - candidate_years) if candidate_years < lo else (candidate_years - hi)
    distance = max(0.0, distance)
    # Being under the minimum is a stronger concern than being somewhat above
    # the soft upper band, but both should be visible in the sub-score.
    penalty_per_year = 15.0 if candidate_years < lo else 8.0
    score = 100.0 - distance * penalty_per_year
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


def _location_canon(loc: str) -> str:
    norm = re.sub(r"[^a-z]", "", (loc or "").lower())
    return CITY_ALIASES.get(norm, norm)


def _location_match_score(intent_location: str | None, candidate_location: str) -> float:
    if not intent_location or not intent_location.strip():
        return _NEUTRAL_SCORE
    intent_l = intent_location.strip().lower()
    if "remote" in intent_l or "anywhere" in intent_l or "work from home" in intent_l:
        return 100.0

    cand_l = (candidate_location or "").strip()
    if not cand_l:
        return _NEUTRAL_SCORE  # unknown location -- don't penalize on missing data

    intent_canon = _location_canon(intent_location)
    cand_canon = _location_canon(cand_l)
    if not intent_canon or not cand_canon:
        return _NEUTRAL_SCORE
    if intent_canon == cand_canon or intent_canon in cand_canon or cand_canon in intent_canon:
        return 100.0

    ratio = difflib.SequenceMatcher(None, intent_canon, cand_canon).ratio()
    if ratio >= 0.6:
        return round(ratio * 100, 1)
    # Different city entirely -- not a hard zero, since relocation/hybrid
    # arrangements are common; scored low but not disqualifying.
    return 20.0


def _availability_to_days(text: str | None) -> float | None:
    """Best-effort parse of a free-text availability string into an
    approximate number of days until the candidate can join. Returns None
    when the text doesn't express a resolvable timeframe (e.g. "Not
    Specified", "Available from <a date we can't parse>")."""
    if not text:
        return None
    t = text.strip().lower()
    if not t or "not specified" in t:
        return None
    if "immediate" in t or "available now" in t or "open to work" in t:
        return 0.0
    m = re.search(r"(\d+(?:\.\d+)?)\s*(day|week|month)", t)
    if m:
        return float(m.group(1)) * _NOTICE_UNIT_DAYS.get(m.group(2), 1.0)
    return None


def _availability_match_score(intent_availability: str | None, candidate_availability: str) -> float:
    if not intent_availability or not intent_availability.strip():
        return _NEUTRAL_SCORE

    target_days = _availability_to_days(intent_availability)
    candidate_days = _availability_to_days(candidate_availability)

    if target_days is None:
        # The recruiter mentioned availability but not a concrete timeframe
        # (e.g. just "notice period"). Reward candidates who at least have a
        # known availability over ones with none on file.
        return 75.0 if candidate_days is not None else _NEUTRAL_SCORE

    if candidate_days is None:
        return 40.0  # unknown -- a mild risk flag, not a hard penalty

    if candidate_days <= target_days:
        return 100.0

    distance_days = candidate_days - target_days
    score = 100.0 - (distance_days / 7.0) * 10.0  # -10 pts per week beyond what was asked for
    return round(max(0.0, min(100.0, score)), 1)


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
    against the parsed search/job intent. Returns a dict with subScores +
    matchScore. See docs/CANDIDATE_SCORING_CRITERIA.md for the full rubric
    this function implements."""
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
    # Do not use generic free-text keywords as industry evidence. In practice
    # those keywords often contain skills/role words (e.g. "SAP", "Java",
    # "Developer"), which made Industry Match incorrectly show 100% for many
    # candidates. Only score this dimension when the parser found an actual
    # industry/domain requirement; otherwise keep it neutral.
    industry_query = intent.get("industry")
    industry_match = _keyword_overlap_score(industry_query, industry_haystack)

    education_haystack = [
        f"{e.get('degree', '')} {e.get('field', '')} {e.get('institution', '')}"
        for e in (candidate.get("education") or [])
    ]
    education_match = _keyword_overlap_score(intent.get("education"), education_haystack)

    technology_match = _technology_match_score(
        required_skills, intent.get("keywords") or [], candidate.get("technologyStack") or []
    )

    location_match = _location_match_score(intent.get("location"), candidate.get("location", ""))
    availability_match = _availability_match_score(intent.get("availability"), candidate.get("availability", ""))

    freshness = _freshness_score(candidate.get("uploadedAt"))

    match_score = (
        skill_match * SKILL_MATCH_WEIGHT
        + designation_match * DESIGNATION_MATCH_WEIGHT
        + technology_match * TECHNOLOGY_MATCH_WEIGHT
        + experience_match * EXPERIENCE_MATCH_WEIGHT
        + industry_match * INDUSTRY_MATCH_WEIGHT
        + education_match * EDUCATION_MATCH_WEIGHT
        + location_match * LOCATION_MATCH_WEIGHT
        + availability_match * AVAILABILITY_MATCH_WEIGHT
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
            "locationMatch": location_match,
            "availabilityMatch": availability_match,
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
