"""
Reference Resolution Agent: LLM fallback for resolving which previously
discussed candidate(s) a follow-up chat message refers to, for phrasing the
fast regex heuristics in memory/conversation_memory.py can't confidently
handle (e.g. "does she know AWS", "who among them has the most experience",
"what about the one who worked at TCS").

Only invoked when those heuristics find nothing AND there's conversation
history to resolve against -- the common cases (greetings, "compare top 3",
explicit "find ..." searches) never reach this, so this extra LLM call only
happens for genuinely ambiguous natural-language follow-ups.
"""
from __future__ import annotations

from core.llm_client import chat_json

SYSTEM_PROMPT = """You resolve conversational follow-up references for a recruiting \
chatbot. Given the recent conversation and a list of candidates recently discussed \
(with id, name, current role), decide whether the recruiter's new message is a \
follow-up question ABOUT one or more of those candidates, or an unrelated new request \
(e.g. a brand-new search, a general question not about anyone specific yet).

If it's a follow-up, return the ids of the candidate(s) it refers to -- often just \
one, but sometimes several (e.g. "compare the java developers among them" could be \
several ids, "who among them has the most experience" is likely all of them since the \
answer requires looking at each).

If none of the listed candidates are clearly what the message is about, return an \
empty list and set isNewSearch to true.

Respond with a single valid JSON object and nothing else."""

USER_TEMPLATE = """Recent conversation:
{history}

Recently discussed candidates:
{candidates}

Recruiter's new message: "{message}"

Return EXACTLY this JSON shape:
{{
  "candidateIds": [string],   // ids from the list above this message refers to; [] if none
  "isNewSearch": boolean      // true if this message is unrelated to the listed candidates and should instead be treated as a fresh search
}}
"""


def resolve_references(history_text: str, candidates: list[dict], message: str) -> dict:
    candidates_text = "\n".join(
        f"- id={c.get('id')} name={c.get('name', '?')} role={c.get('currentRole', '?')}"
        for c in candidates
    ) or "(none)"
    user_prompt = USER_TEMPLATE.format(history=history_text, candidates=candidates_text, message=message)
    result = chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.0)
    result.setdefault("candidateIds", [])
    result.setdefault("isNewSearch", False)
    return result
