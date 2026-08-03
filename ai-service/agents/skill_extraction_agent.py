"""
Skill Extraction Agent: derives categorized skills (primary vs secondary)
from the candidate's experience, projects, and raw resume text.
"""
from __future__ import annotations

import json

from core.llm_client import chat_json

SYSTEM_PROMPT = """You are a technical skills analyst for an ATS. Given a candidate's \
work experience, projects, and raw resume text, you identify their real, demonstrated \
skills (technical and key professional/domain skills) and categorize them by how \
prominent and recent they are in the candidate's history.

"primary" skills: skills that are central to the candidate's recent roles/projects, used \
repeatedly, or explicitly emphasized (e.g. listed first, used in the most recent job, used \
across multiple projects).

"secondary" skills: skills that are mentioned but used less centrally, only in older roles, \
only once, or only in a "familiar with" / "exposure to" capacity.

Do not invent skills that aren't evidenced in the provided text. Normalize skill names to \
their common form (e.g. "ReactJS" -> "React", "Node" -> "Node.js"). Do not duplicate a skill \
across both lists. Respond with a single valid JSON object and nothing else."""

USER_TEMPLATE = """Candidate experience (JSON):
{experience_json}

Candidate projects (JSON):
{projects_json}

Raw resume text (for additional context, e.g. a dedicated "Skills" section):
---
{resume_text}
---

Return EXACTLY this JSON shape:
{{
  "primary": [string],
  "secondary": [string]
}}
"""


def extract_skills(resume_text: str, experience: list[dict], projects: list[dict]) -> dict:
    """Returns {"primary": [...], "secondary": [...]}."""
    user_prompt = USER_TEMPLATE.format(
        experience_json=json.dumps(experience, ensure_ascii=False)[:6000],
        projects_json=json.dumps(projects, ensure_ascii=False)[:6000],
        resume_text=resume_text[:10000],
    )
    result = chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.1)
    result.setdefault("primary", [])
    result.setdefault("secondary", [])

    # De-duplicate: if a skill appears in both, keep it only in primary.
    primary = list(dict.fromkeys(result["primary"]))
    secondary = [s for s in dict.fromkeys(result["secondary"]) if s not in primary]
    return {"primary": primary, "secondary": secondary}
