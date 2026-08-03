"""
Profile Generation Agent: synthesizes the higher-level "AI judgement" fields
of a candidate profile -- summary, highlights, strengths/weaknesses, suitable
roles, technology stack, and an overall 0-100 rating -- from everything
extracted so far (parsed fields + skills + deterministic experience years).
"""
from __future__ import annotations

import json

from core.llm_client import chat_json

SYSTEM_PROMPT = """You are a senior technical recruiter writing an internal candidate \
profile summary for other recruiters to skim quickly. You are honest and balanced: you \
call out real strengths AND real gaps/weaknesses, you never oversell a thin resume, and \
you ground every statement in the provided data -- never invent achievements, employers, \
or skills that are not present in the input.

You will also assign an overallRating from 0-100 reflecting the candidate's overall \
strength as a hire across seniority, breadth/depth of skills, career progression, and \
project impact, calibrated roughly as: 0-39 weak/early or poor fit, 40-59 average, 60-74 \
solid, 75-89 strong, 90-100 exceptional. Think through your justification internally, but \
your response must contain ONLY the final JSON -- do not include your reasoning as text.

Respond with a single valid JSON object and nothing else."""

USER_TEMPLATE = """Candidate data:

Name: {name}
Current role: {current_role}
Location: {location}
Total experience (years, computed deterministically): {total_experience_years}

Skills:
{skills_json}

Experience:
{experience_json}

Education:
{education_json}

Projects:
{projects_json}

Certifications: {certifications}
Languages: {languages}

Return EXACTLY this JSON shape:
{{
  "aiSummary": string,            // 2-4 sentence recruiter-facing summary of who this candidate is
  "careerHighlights": [string],   // 3-6 concrete, specific highlights (roles, achievements, notable projects)
  "strengths": [string],          // 3-5 genuine strengths grounded in the data
  "weaknesses": [string],         // 2-4 honest gaps or risk areas (e.g. narrow domain exposure, employment gaps, no leadership experience) -- if the data truly shows none, return a short list noting limited visibility into certain areas rather than an empty list
  "suitableRoles": [string],      // 3-6 job titles this candidate is realistically well-suited for next
  "technologyStack": [string],    // the concrete technologies/tools/frameworks/languages this candidate has hands-on experience with
  "overallRating": number         // integer 0-100
}}
"""


def generate_profile(
    *,
    name: str,
    current_role: str,
    location: str,
    total_experience_years: float,
    skills: dict,
    experience: list[dict],
    education: list[dict],
    projects: list[dict],
    certifications: list[str],
    languages: list[str],
) -> dict:
    user_prompt = USER_TEMPLATE.format(
        name=name or "(not stated)",
        current_role=current_role or "(not stated)",
        location=location or "(not stated)",
        total_experience_years=total_experience_years,
        skills_json=json.dumps(skills, ensure_ascii=False),
        experience_json=json.dumps(experience, ensure_ascii=False)[:6000],
        education_json=json.dumps(education, ensure_ascii=False)[:3000],
        projects_json=json.dumps(projects, ensure_ascii=False)[:4000],
        certifications=", ".join(certifications) or "(none stated)",
        languages=", ".join(languages) or "(none stated)",
    )
    result = chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.3)

    result.setdefault("aiSummary", "")
    result.setdefault("careerHighlights", [])
    result.setdefault("strengths", [])
    result.setdefault("weaknesses", [])
    result.setdefault("suitableRoles", [])
    result.setdefault("technologyStack", [])

    try:
        rating = int(round(float(result.get("overallRating", 0))))
    except (TypeError, ValueError):
        rating = 0
    result["overallRating"] = max(0, min(100, rating))

    return result
