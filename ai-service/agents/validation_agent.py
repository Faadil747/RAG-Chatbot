"""
Validation Agent: gate-keeps the chatbot to the recruitment/candidate
domain. Fast heuristics handle the obvious cases (greetings, short
follow-ups, anything referencing candidates already in memory, and clearly
recruiting-flavored language) without spending an LLM call; anything
ambiguous falls through to a cheap LLM classification call.
"""
from __future__ import annotations

import re

from core.llm_client import chat_json

_GREETING_RE = re.compile(
    r"^\s*(hi|hello|hey|hola|good\s+(morning|afternoon|evening)|thanks|thank\s+you|ok|okay|sure|yes|no|yep|nope)\b",
    re.IGNORECASE,
)

_SHORT_FOLLOWUP_RE = re.compile(
    r"\b(compare|top\s*\d+|top\s+(one|two|three|first|second|third)|this candidate|that candidate|"
    r"first one|second one|third one|both of them|all of them|him|her|them|"
    r"generate|interview questions?|hiring recommendation|recommend|justif)\b",
    re.IGNORECASE,
)

_RECRUITING_KEYWORDS_RE = re.compile(
    r"\b(candidate|resume|cv|hire|hiring|recruit|skill|experience|profile|applicant|"
    r"designation|role|position|salary|notice period|availability|shortlist|interview|"
    r"jd|job description|match score|rating|education|degree|portfolio|github|linkedin|"
    r"engineer|developer|manager|designer|analyst|intern)\b",
    re.IGNORECASE,
)

SYSTEM_PROMPT = """You are a strict domain classifier for a recruiting-platform chatbot. \
The chatbot's ONLY job is to answer questions about candidates in an uploaded resume \
database (searching, comparing, summarizing, recommending, generating interview questions \
for THOSE candidates), plus handling greetings and short conversational follow-ups \
("yes", "compare top 3", "tell me more", etc). Anything else -- general knowledge \
questions, current events, coding help unrelated to candidate data, math problems, etc -- \
is OUT of domain.

Respond with a single valid JSON object and nothing else: {"inDomain": true or false}"""


def is_in_domain(message: str, has_conversation_context: bool = False) -> bool:
    text = (message or "").strip()
    if not text:
        return True  # empty message: let the chat handler deal with it, not a domain issue

    if _GREETING_RE.search(text):
        return True

    if _SHORT_FOLLOWUP_RE.search(text):
        return True

    if _RECRUITING_KEYWORDS_RE.search(text):
        return True

    # Very short messages in an ongoing conversation are very likely
    # follow-ups ("him", "the second", "why", numbers, etc).
    if has_conversation_context and len(text.split()) <= 4:
        return True

    # Ambiguous / longer message with no obvious recruiting signal: ask the LLM.
    try:
        result = chat_json(
            SYSTEM_PROMPT,
            f'User message: "{text}"',
            temperature=0.0,
            max_tokens=50,
        )
        return bool(result.get("inDomain", False))
    except Exception:
        # If the classifier itself fails, fail open toward in-domain so a
        # transient LLM error doesn't block a legitimate recruiting question.
        return True
