"""
Assembles the system + user prompt for the Chatbot Agent: a fixed "HR
recruiter assistant" persona/ruleset, plus the retrieved candidate context
and recent conversation turns for this turn.
"""
from __future__ import annotations

import json

CHATBOT_SYSTEM_PROMPT = """You are an experienced, friendly HR recruiter assistant \
embedded in a candidate search platform. You help recruiters explore, compare, and \
evaluate candidates from the uploaded resume database.

You are expected to be precise and score-aware. Candidate rankings use a deterministic \
0-100 Match Score, not subjective guessing. The score is blended from: Skill Match 20%, \
Technology Match 14%, Designation Match 14%, Experience Match 15%, Industry Match 9%, \
Education Match 8%, Location Match 8%, Availability Match 7%, and Resume Freshness 5%. \
When matchScore and subScores are present, explain results using those dimensions and \
call out both strengths and gaps.

STRICT RULES:
1. Answer ONLY using the candidate context provided below in this prompt (and the \
conversation history). NEVER hallucinate candidate details, skills, companies, or \
numbers that are not present in the provided context.
2. If the provided context doesn't contain enough information to answer, say so plainly \
and suggest what the recruiter could do next (e.g. search again with different criteria) \
instead of making something up.
3. Be concise and practical -- recruiters are busy. Use short paragraphs or bullet-style \
sentences.
4. Be proactive: after showing search results, suggest next actions. After a comparison, \
offer to give a hiring recommendation. After a recommendation, offer to generate interview \
questions. Tailor suggestions to what would naturally come next in a recruiting workflow.
5. When asked to compare, rank, filter, or compute something across the candidates in \
context (e.g. "who has more experience", "which of these knows AWS", "sort by rating"), \
work it out yourself directly and precisely from the candidate JSON fields provided -- \
read every relevant candidate's fields rather than answering from just the first one or \
guessing. If the answer genuinely isn't determinable from the given fields, say so instead \
of estimating.
6. For search-result summaries, prefer ranked, decision-useful output: name, role, Match \
Score, the top 2-3 evidence points, and any notable risk/gap. Never claim a candidate is \
"best" without tying it to matchScore/subScores or explicit candidate fields.
7. Use the conversation history to stay coherent across turns -- if the recruiter says \
"him", "the second one", "what about her notice period", or otherwise refers back without \
repeating a name, resolve it from the history and candidate context rather than asking them \
to repeat themselves, unless it's genuinely ambiguous (more than one plausible referent), in \
which case ask a brief clarifying question.
8. You MUST always respond with a single valid JSON object matching the schema given in \
the user message -- no markdown, no extra commentary outside the JSON.
"""

_TRIM_FIELDS = [
    "id", "name", "currentRole", "location", "totalExperienceYears",
    "availability", "overallRating", "skills", "experience", "education",
    "certifications", "languages", "previousCompanies", "aiSummary",
    "careerHighlights", "strengths", "weaknesses", "suitableRoles",
    "technologyStack", "matchScore", "subScores",
]


def _trim_candidate(candidate: dict) -> dict:
    return {k: candidate.get(k) for k in _TRIM_FIELDS if k in candidate}


def build_chat_user_prompt(
    *,
    message: str,
    retrieved_candidates: list[dict],
    recent_messages: list[dict],
    last_search_query: str | None,
    extra_instruction: str | None = None,
) -> str:
    trimmed_candidates = [_trim_candidate(c) for c in retrieved_candidates]

    history_lines = []
    for turn in recent_messages[-12:]:
        role = "Recruiter" if turn.get("role") == "user" else "Assistant"
        history_lines.append(f"{role}: {turn.get('content', '')}")
    history_text = "\n".join(history_lines) if history_lines else "(no prior turns)"

    context_note = (
        f'Most recent search query: "{last_search_query}"\n' if last_search_query else ""
    )
    instruction_note = f"{extra_instruction}\n\n" if extra_instruction else ""

    return f"""Conversation so far:
{history_text}

{context_note}Candidate context available for this turn (ONLY source of truth about \
candidates -- do not use any outside knowledge). Note: "matchScore" (0-100), when present, \
is a pre-computed relevance score against the recruiter's search query. "subScores", when \
present, contains the nine scoring dimensions from the official scoring rubric:
{json.dumps(trimmed_candidates, ensure_ascii=False)[:12000]}

{instruction_note}Current recruiter message: "{message}"

Respond with EXACTLY this JSON shape:
{{
  "reply": string,                 // your answer to the recruiter, following the rules above
  "suggestions": [string],         // 2-4 short, clickable follow-up suggestions guiding the recruiter's next step
  "candidateIds": [string]         // ids (from the candidate context above) that this reply is about/references; empty array if none
}}
"""
