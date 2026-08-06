"""
Recommendation Agent: produces a grounded `Justification` object for a
single candidate against a query/context. Reused in three places:

1. /ai/search        -- ranks 1-3 get a justification pre-filled.
2. /ai/search/analysis -- on-demand justification for any candidate.
3. /ai/chat           -- "generate interview questions" / "hiring
   recommendation" style asks route through here so they're grounded in the
   candidate's actual stored data rather than free-associated by the
   chatbot agent.
"""
from __future__ import annotations

import json

from core.llm_client import chat_json

SYSTEM_PROMPT = """You are an experienced technical recruiter producing a grounded, \
evidence-based hiring justification for ONE specific candidate against a recruiter's \
query or request. You must base every statement strictly on the candidate JSON provided \
-- never invent skills, employers, achievements, or experience the candidate does not \
have. If the candidate is a weak fit for something in the query, say so honestly in \
"concerns" rather than glossing over it.

When matchScore/subScores are present, use them as the primary scoring evidence. The \
official scoring rubric is: Skill Match 20%, Technology Match 14%, Designation Match 14%, \
Experience Match 15%, Industry Match 9%, Education Match 8%, Location Match 8%, \
Availability Match 7%, Resume Freshness 5%. Tie recommendations to these dimensions \
plus concrete resume/profile evidence.

Respond with a single valid JSON object and nothing else."""

USER_TEMPLATE = """Recruiter's query / request: "{query}"

Focus of this analysis: {focus_instruction}

Candidate JSON:
{candidate_json}

Return EXACTLY this JSON shape:
{{
  "matchingSkills": [string],        // specific skills/technologies this candidate has that match the query
  "relevantExperience": string,      // 1-3 sentence summary of the candidate's relevant experience tying them to the query
  "strongPoints": [string],          // 3-6 specific, concrete strengths (cite real skills/roles/projects)
  "potentialConcerns": [string],     // 1-4 honest gaps/risks relative to the query (can be a short list noting minor unknowns if nothing major)
  "recommendation": string,          // one of: "Strong Hire", "Hire", "Consider", "Weak Fit" -- plus a short one-sentence rationale
  "interviewQuestions": [string]     // 3-6 targeted interview questions to validate this candidate's fit for the query, grounded in their actual background (e.g. probing specific claimed projects/skills)
}}
"""

_FOCUS_INSTRUCTIONS = {
    "general": "Provide a balanced overall fit assessment against the query.",
    "interview_questions": (
        "The recruiter specifically wants interview questions -- put extra care into the "
        "interviewQuestions field, making questions specific to this candidate's stated "
        "projects, roles, and claimed skills so they can be verified in an interview."
    ),
    "hiring_recommendation": (
        "The recruiter specifically wants a hiring recommendation -- put extra care into "
        "recommendation and strongPoints/potentialConcerns, weighing this candidate's overall "
        "strength as a hire, not just keyword fit."
    ),
}


def _trim_candidate_for_prompt(candidate: dict) -> dict:
    """Trim a full candidate record to the fields relevant for grounding the
    justification (drop resumeText/embeddingText which are large and not
    useful for this reasoning step)."""
    keys = [
        "id", "name", "currentRole", "location", "totalExperienceYears",
        "availability", "overallRating", "skills", "experience", "education",
        "projects", "certifications", "languages", "previousCompanies",
        "aiSummary", "careerHighlights", "strengths", "weaknesses",
        "suitableRoles", "technologyStack",
        "matchScore", "subScores",
    ]
    return {k: candidate.get(k) for k in keys if k in candidate}


def analyze_candidate(candidate: dict, query: str, focus: str = "general") -> dict:
    """Returns a Justification-shaped dict (camelCase keys)."""
    trimmed = _trim_candidate_for_prompt(candidate)
    focus_instruction = _FOCUS_INSTRUCTIONS.get(focus, _FOCUS_INSTRUCTIONS["general"])

    user_prompt = USER_TEMPLATE.format(
        query=query or "General candidate assessment",
        focus_instruction=focus_instruction,
        candidate_json=json.dumps(trimmed, ensure_ascii=False)[:8000],
    )
    result = chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.3)

    result.setdefault("matchingSkills", [])
    result.setdefault("relevantExperience", "")
    result.setdefault("strongPoints", [])
    result.setdefault("potentialConcerns", [])
    result.setdefault("recommendation", "")
    result.setdefault("interviewQuestions", [])
    return result
