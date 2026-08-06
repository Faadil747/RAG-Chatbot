"""
In-memory (module-level, single-process) conversation state for /ai/chat.

This is deliberately NOT persisted to disk -- persisting chat history to
Postgres is the backend's job. This service only needs enough short-lived
memory to resolve pronouns/follow-ups ("compare top 3", "tell me more about
the second one") within the current session's lifetime.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

MAX_HISTORY_TURNS = 20

_ORDINAL_WORDS = {
    "first": 0, "1st": 0, "one": 0,
    "second": 1, "2nd": 1, "two": 1,
    "third": 2, "3rd": 2, "three": 2,
    "fourth": 3, "4th": 3, "four": 3,
    "fifth": 4, "5th": 4, "five": 4,
}


@dataclass
class ConversationState:
    session_id: str
    messages: list[dict] = field(default_factory=list)  # [{"role": "user"|"assistant", "content": str}]
    last_search_query: str | None = None
    last_search_results: list[dict] = field(default_factory=list)  # CandidateSummary-shaped dicts
    last_candidates_discussed: list[str] = field(default_factory=list)  # candidate ids
    last_comparison: list[str] | None = None  # candidate ids in the last comparison


# Module-level session store. Fine for a single-process dev service.
SESSIONS: dict[str, ConversationState] = {}


def get_or_create_session(session_id: str | None) -> ConversationState:
    if session_id and session_id in SESSIONS:
        return SESSIONS[session_id]
    new_id = session_id if session_id else str(uuid.uuid4())
    if new_id not in SESSIONS:
        SESSIONS[new_id] = ConversationState(session_id=new_id)
    return SESSIONS[new_id]


def add_message(state: ConversationState, role: str, content: str) -> None:
    state.messages.append({"role": role, "content": content})
    if len(state.messages) > MAX_HISTORY_TURNS:
        state.messages = state.messages[-MAX_HISTORY_TURNS:]


def update_search_results(state: ConversationState, query: str, results: list[dict]) -> None:
    """`results` should be a list of CandidateSummary-shaped dicts (with at least id/name)."""
    state.last_search_query = query
    state.last_search_results = results
    ids = [r["id"] for r in results if r.get("id")]
    # Merge into discussed history, most-recent-first, de-duplicated.
    state.last_candidates_discussed = ids + [
        cid for cid in state.last_candidates_discussed if cid not in ids
    ]


def note_candidates_discussed(state: ConversationState, candidate_ids: list[str]) -> None:
    ids = [cid for cid in candidate_ids if cid]
    if not ids:
        return
    state.last_candidates_discussed = ids + [
        cid for cid in state.last_candidates_discussed if cid not in ids
    ]


_LOOKS_LIKE_NEW_SEARCH_RE = re.compile(
    r"^\s*(show|find|search|look\s+for|get\s+me|list|who\s+are|i\s+need|i\s+want|"
    r"give\s+me|any)\b",
    re.IGNORECASE,
)


def looks_like_new_search(message: str) -> bool:
    return bool(_LOOKS_LIKE_NEW_SEARCH_RE.search(message.strip()))


_FILLER_RE = re.compile(
    r"^\s*(hi|hello|hey|hola|good\s+(morning|afternoon|evening)|thanks|thank\s+you|"
    r"ok|okay|sure|yes|no|yep|nope|great|cool|nice)\b\s*[!.,]*\s*$",
    re.IGNORECASE,
)


def is_conversational_filler(message: str) -> bool:
    """True for short greetings/acknowledgments that carry no search intent
    and reference nothing (e.g. "hi", "thanks", "ok") -- as opposed to a
    message that merely lacks a leading search verb ("python developer 5
    years") but is still a real query."""
    return bool(_FILLER_RE.match(message.strip()))


_ANALYTICS_RE = re.compile(
    r"\bhow\s+many\b|\bcount\s+of\b|\bnumber\s+of\b|\btotal\s+(candidates|number|count)\b|"
    r"\baverage\b|\bmedian\b|\bmost\s+common\b|\bmost\s+popular\b|\btop\s*\d+\s+skills?\b|"
    r"\bpercentage\b|\bwhat\s+percent\b|\bbreakdown\b|\bdistribution\b|\bstatistics\b|"
    r"\bhow\s+many\s+of\s+(them|these|those)\b",
    re.IGNORECASE,
)


def looks_like_analytics_question(message: str) -> bool:
    """True for aggregate/statistical questions over the whole candidate
    pool ("how many Python developers do we have", "average experience for
    the DevOps job", "most common skills", "breakdown by location") -- these
    need a real count/stat computed over ALL candidates, not just whatever a
    single ranked search happens to retrieve (which only ever returns its
    top-K matches, never a total)."""
    return bool(_ANALYTICS_RE.search(message.strip()))


_COMPARE_RE = re.compile(r"\bcompare\b", re.IGNORECASE)
_TOP_N_RE = re.compile(r"\btop\s*(\d+|one|two|three|four|five)\b", re.IGNORECASE)
_ALL_RE = re.compile(
    r"\ball\s+of\s+them\b|\bboth\b|\beveryone\b|\bamong\s+them\b|\bof\s+these\b|"
    r"\bof\s+those\b|\bthese\s+candidates\b|\bthose\s+candidates\b|\bany\s+of\s+them\b|"
    r"\bwhich\s+of\s+(them|these|those)\b|\bwho\s+(of|among)\s+(them|these|those)\b",
    re.IGNORECASE,
)

_WORD_TO_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}


def resolve_referenced_candidates(state: ConversationState, message: str, store_get) -> list[str]:
    """Resolve which candidate ids a follow-up message refers to, using
    conversation memory so the recruiter never has to repeat candidate names.

    `store_get(candidate_id) -> dict | None` is used to resolve names mentioned
    in the message against the currently-known candidate pool.
    """
    text = message.strip()
    lower = text.lower()
    pool = state.last_search_results or [
        {"id": cid} for cid in state.last_candidates_discussed
    ]
    pool_ids = [c["id"] for c in pool if c.get("id")]

    if not pool_ids:
        return []

    # "compare", "all of them", "both"
    if _COMPARE_RE.search(lower) or _ALL_RE.search(lower):
        top_match = _TOP_N_RE.search(lower)
        if top_match:
            n_raw = top_match.group(1)
            n = _WORD_TO_NUM.get(n_raw, None)
            if n is None:
                try:
                    n = int(n_raw)
                except ValueError:
                    n = 3
            return pool_ids[:n]
        return pool_ids[: min(3, len(pool_ids))]

    top_match = _TOP_N_RE.search(lower)
    if top_match:
        n_raw = top_match.group(1)
        n = _WORD_TO_NUM.get(n_raw)
        if n is None:
            try:
                n = int(n_raw)
            except ValueError:
                n = 3
        return pool_ids[:n]

    # Ordinal references: "the second one", "first candidate"
    ordinal_matches = []
    for word, idx in _ORDINAL_WORDS.items():
        if re.search(rf"\b{word}\b", lower):
            ordinal_matches.append(idx)
    if ordinal_matches:
        resolved = [pool_ids[i] for i in sorted(set(ordinal_matches)) if i < len(pool_ids)]
        if resolved:
            return resolved

    # Singular reference ("this candidate" / "that candidate" / "him" / "her" / "it")
    # -> most recently discussed one candidate.
    if re.search(r"\b(this|that|him|her|it)\b", lower):
        if state.last_candidates_discussed:
            return state.last_candidates_discussed[:1]

    # Plural reference ("them" / "they" / "these" / "those") -> the whole
    # recent pool, not just the single most-recent candidate -- "does he
    # know AWS" is about one person, but "do they know AWS" or "which of
    # them" is asking across the group.
    if re.search(r"\b(them|they|these|those)\b", lower):
        if pool_ids:
            return pool_ids[: min(5, len(pool_ids))]

    # Name matching: check if any known candidate's name appears in the message.
    name_matches: list[str] = []
    for cid in pool_ids:
        candidate = store_get(cid)
        if not candidate:
            continue
        name = (candidate.get("name") or "").strip().lower()
        if name and name in lower:
            name_matches.append(cid)
    if name_matches:
        return name_matches

    return []
