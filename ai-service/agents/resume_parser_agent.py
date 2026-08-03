"""
Resume Parsing Agent: turns raw resume text into structured fields via a
single LLM call. This agent does NOT compute totalExperienceYears or
overallRating -- those come later (deterministic math + Profile Generation
Agent respectively).
"""
from __future__ import annotations

from core.llm_client import chat_json

SYSTEM_PROMPT = """You are an expert resume/CV parser used inside an ATS (applicant \
tracking system). You extract structured factual information from raw resume text \
with high precision. You NEVER invent information that is not present or strongly \
implied in the text. If a field cannot be determined, use an empty string "" (for \
scalar fields) or an empty array [] (for list fields) -- never use placeholder text \
like "N/A" or "Unknown".

Rules for dates in experience entries: use the format the resume uses, normalized to \
either "YYYY-MM" or "YYYY" (prefer "YYYY-MM" if the month is stated). For a current/ongoing \
role, set endDate to exactly "Present". Many resumes state a role's length as a relative \
duration instead of calendar dates (e.g. "2 yrs", "18 months", "3 years 6 months") -- in \
that case leave startDate/endDate as "" (you cannot invent calendar dates), but you MUST \
still convert that stated duration into an accurate "durationMonths" integer (e.g. "2 yrs" \
-> 24, "18 months" -> 18, "3 years 6 months" -> 42). durationMonths must never be 0 for a \
role that states any duration or date range, dated or not -- it is the only signal available \
for undated entries and is used to compute the candidate's total experience.

Always respond with a single valid JSON object and nothing else."""

USER_TEMPLATE = """Extract the following structured JSON object from the resume text below.

Return EXACTLY this JSON shape (camelCase keys, no extra keys):
{{
  "name": string,
  "email": string,
  "phone": string,
  "currentRole": string,
  "location": string,
  "linkedin": string or null,
  "github": string or null,
  "portfolio": string or null,
  "experience": [
    {{"company": string, "role": string, "startDate": string, "endDate": string, "durationMonths": number, "description": string}}
  ],
  "education": [
    {{"institution": string, "degree": string, "field": string, "year": string}}
  ],
  "projects": [
    {{"name": string, "description": string, "techStack": [string]}}
  ],
  "certifications": [string],
  "languages": [string],
  "previousCompanies": [string]
}}

Notes:
- "currentRole" is the job title of the most recent / current role (or, if no formal \
employment history exists, the title implied by the resume, e.g. "Final Year Student").
- "durationMonths" is that single role's length in months. If explicit calendar dates are \
present, derive it from them. If only a relative duration is stated (no calendar dates), \
convert that duration directly -- this is the ONLY source of truth for undated roles, so \
it must reflect what the resume actually says, not be left at 0.
- "previousCompanies" should list every distinct employer mentioned in experience, most \
recent first.
- "experience" should be ordered most recent first.

RESUME TEXT:
---
{resume_text}
---
"""


def parse_resume(resume_text: str) -> dict:
    """Returns a dict with keys: name, email, phone, currentRole, location, linkedin,
    github, portfolio, experience, education, projects, certifications, languages,
    previousCompanies."""
    user_prompt = USER_TEMPLATE.format(resume_text=resume_text[:15000])
    result = chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.1)

    # Defensive defaults in case the LLM omits a key.
    result.setdefault("name", "")
    result.setdefault("email", "")
    result.setdefault("phone", "")
    result.setdefault("currentRole", "")
    result.setdefault("location", "")
    result.setdefault("linkedin", None)
    result.setdefault("github", None)
    result.setdefault("portfolio", None)
    result.setdefault("experience", [])
    result.setdefault("education", [])
    result.setdefault("projects", [])
    result.setdefault("certifications", [])
    result.setdefault("languages", [])
    result.setdefault("previousCompanies", [])
    return result
