"""
POST /ai/parse -- multipart resume upload -> full structured Candidate JSON.

Pipeline: extract raw text -> Resume Parsing Agent -> Skill Extraction Agent
-> deterministic experience-years computation -> Profile Generation Agent ->
assemble + return the Candidate JSON. Does NOT persist/index -- that is a
separate call the backend makes to POST /ai/index.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from agents.profile_generation_agent import generate_profile
from agents.resume_parser_agent import parse_resume
from agents.skill_extraction_agent import extract_skills
from core.experience_calc import (
    backfill_missing_durations,
    compute_duration_months,
    compute_total_experience_years,
)
from core.parsing.text_extractor import UnsupportedFileTypeError, extract_raw_text
from models.candidate import Candidate

logger = logging.getLogger("ai-service.routers.parse")

router = APIRouter()

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB

_AVAILABILITY_PATTERNS = [
    (re.compile(r"\bimmediate(ly)?\s+available\b|\bavailable\s+immediately\b", re.I), "Immediate"),
    (re.compile(r"\bnotice\s+period\s*[:\-]?\s*(\d+)\s*(day|week|month)s?", re.I), None),
    (re.compile(r"\bavailable\s+from\s+([A-Za-z0-9 ,]+)", re.I), None),
    (re.compile(r"\bopen\s+to\s+work\b", re.I), "Immediate"),
]


def _infer_availability(resume_text: str) -> str:
    text = resume_text or ""

    m = _AVAILABILITY_PATTERNS[0][0].search(text)
    if m:
        return "Immediate"

    m = _AVAILABILITY_PATTERNS[1][0].search(text)
    if m:
        return f"Notice period: {m.group(1)} {m.group(2)}(s)"

    m = _AVAILABILITY_PATTERNS[2][0].search(text)
    if m:
        return f"Available from {m.group(1).strip()}"

    m = _AVAILABILITY_PATTERNS[3][0].search(text)
    if m:
        return "Immediate"

    return "Not Specified"


@router.post("/parse", response_model=Candidate, response_model_by_alias=True)
async def parse_resume_endpoint(file: UploadFile = File(...)) -> Candidate:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file has no filename.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds the 15MB limit.")

    try:
        raw_text = extract_raw_text(file.filename, file_bytes)
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if len(raw_text.strip()) < 20:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract usable text from this resume. If it is a scanned "
                "document, ensure the `tesseract` OCR binary is installed on this host."
            ),
        )

    try:
        parsed = await asyncio.to_thread(parse_resume, raw_text)
    except Exception:
        logger.exception("Resume Parsing Agent failed")
        raise HTTPException(status_code=502, detail="Resume parsing (LLM) step failed.")

    try:
        skills = await asyncio.to_thread(
            extract_skills, raw_text, parsed.get("experience", []), parsed.get("projects", [])
        )
    except Exception:
        logger.exception("Skill Extraction Agent failed")
        raise HTTPException(status_code=502, detail="Skill extraction (LLM) step failed.")

    # Deterministic experience math -- never trust the LLM's arithmetic.
    # Where calendar dates are present, they win outright. Where they aren't
    # (resume states a relative duration like "2 yrs" instead), keep the
    # Resume Parsing Agent's own durationMonths estimate rather than
    # clobbering it with 0, and fall back to a regex scan of the raw text
    # for any entry that still has neither.
    experience = parsed.get("experience", [])
    for entry in experience:
        computed = compute_duration_months(entry.get("startDate"), entry.get("endDate"))
        if computed > 0:
            entry["durationMonths"] = computed
    experience = backfill_missing_durations(experience, raw_text)
    total_experience_years = compute_total_experience_years(experience)

    try:
        profile = await asyncio.to_thread(
            generate_profile,
            name=parsed.get("name", ""),
            current_role=parsed.get("currentRole", ""),
            location=parsed.get("location", ""),
            total_experience_years=total_experience_years,
            skills=skills,
            experience=experience,
            education=parsed.get("education", []),
            projects=parsed.get("projects", []),
            certifications=parsed.get("certifications", []),
            languages=parsed.get("languages", []),
        )
    except Exception:
        logger.exception("Profile Generation Agent failed")
        raise HTTPException(status_code=502, detail="Profile generation (LLM) step failed.")

    candidate_dict = {
        "id": str(uuid.uuid4()),
        "name": parsed.get("name", ""),
        "email": parsed.get("email", ""),
        "phone": parsed.get("phone", ""),
        "currentRole": parsed.get("currentRole", ""),
        "location": parsed.get("location", ""),
        "linkedin": parsed.get("linkedin"),
        "github": parsed.get("github"),
        "portfolio": parsed.get("portfolio"),
        "totalExperienceYears": total_experience_years,
        "availability": _infer_availability(raw_text),
        "overallRating": profile.get("overallRating", 0),
        "skills": skills,
        "experience": experience,
        "education": parsed.get("education", []),
        "projects": parsed.get("projects", []),
        "certifications": parsed.get("certifications", []),
        "languages": parsed.get("languages", []),
        "previousCompanies": parsed.get("previousCompanies", []),
        "aiSummary": profile.get("aiSummary", ""),
        "careerHighlights": profile.get("careerHighlights", []),
        "strengths": profile.get("strengths", []),
        "weaknesses": profile.get("weaknesses", []),
        "suitableRoles": profile.get("suitableRoles", []),
        "technologyStack": profile.get("technologyStack", []),
        "resumeText": raw_text,
    }

    return Candidate(**candidate_dict)
