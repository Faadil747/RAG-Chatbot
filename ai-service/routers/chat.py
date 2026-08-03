"""
POST /ai/chat -- the RAG-grounded conversational recruitment chatbot.

Pipeline: Validation Agent (in-domain gate) -> retrieval (new search, or
memory-resolved follow-up references) -> Prompt Builder -> Chatbot Agent
(or, for interview-question / hiring-recommendation asks, the
Recommendation Agent directly) -> memory update -> response.
"""
from __future__ import annotations

import asyncio
import logging
import re

from fastapi import APIRouter, HTTPException

from agents.chatbot_agent import generate_reply
from agents.recommendation_agent import analyze_candidate
from agents.validation_agent import is_in_domain
from memory.conversation_memory import (
    add_message,
    get_or_create_session,
    is_conversational_filler,
    looks_like_new_search,
    note_candidates_discussed,
    resolve_referenced_candidates,
    update_search_results,
)
from models.candidate import candidate_to_summary
from models.chat import ChatRequest, ChatResponse
from rag.prompt_builder import build_chat_user_prompt
from services.candidate_store import candidate_store
from services.search_pipeline import run_search

logger = logging.getLogger("ai-service.routers.chat")

router = APIRouter()

OUT_OF_DOMAIN_REPLY = "I can only answer questions related to the uploaded candidate database."

CHAT_SEARCH_TOP_K = 8
MAX_CHAT_CONTEXT_CANDIDATES = 8
MAX_RECOMMENDATION_CANDIDATES = 3

_INTERVIEW_QUESTIONS_RE = re.compile(r"interview\s+questions?|questions?\s+to\s+ask", re.I)
_HIRING_RECOMMENDATION_RE = re.compile(
    r"hiring\s+recommendation|should\s+(we|i)\s+hire|good\s+(hire|fit)|"
    r"recommend(ation)?\s+(for\s+)?(hiring|this candidate)", re.I,
)


def _format_recommendation_reply(candidates: list[dict], justifications: list[dict], focus: str) -> str:
    sections = []
    for candidate, justification in zip(candidates, justifications):
        name = candidate.get("name") or "This candidate"
        if focus == "interview_questions":
            questions = justification.get("interviewQuestions") or []
            bullet_list = "\n".join(f"  - {q}" for q in questions) or "  (no questions generated)"
            sections.append(f"**{name}** -- suggested interview questions:\n{bullet_list}")
        else:
            rec = justification.get("recommendation") or "No recommendation available."
            reasons = justification.get("strongPoints") or []
            concerns = justification.get("potentialConcerns") or []
            reasons_txt = "\n".join(f"  + {r}" for r in reasons)
            concerns_txt = "\n".join(f"  - {c}" for c in concerns)
            sections.append(
                f"**{name}** -- {rec}\n{reasons_txt}\n{concerns_txt}".strip()
            )
    return "\n\n".join(sections)


@router.post("/chat", response_model=ChatResponse, response_model_by_alias=True)
async def chat(payload: ChatRequest) -> ChatResponse:
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message must not be empty.")

    state = get_or_create_session(payload.session_id)
    has_context = len(state.messages) > 0

    add_message(state, "user", message)

    # -- 1. Validation Agent: domain gate -----------------------------------
    try:
        in_domain = await asyncio.to_thread(is_in_domain, message, has_context)
    except Exception:
        logger.exception("Validation Agent errored; failing open (treating as in-domain).")
        in_domain = True

    if not in_domain:
        add_message(state, "assistant", OUT_OF_DOMAIN_REPLY)
        return ChatResponse(
            session_id=state.session_id,
            reply=OUT_OF_DOMAIN_REPLY,
            suggestions=[],
            candidate_ids=[],
            candidates=[],
        )

    # -- 2. Retrieval ---------------------------------------------------------
    retrieved_candidates: list[dict] = []
    resolved_ids: list[str] = []
    extra_instruction: str | None = None

    # A message either explicitly reads as a new search ("find python
    # developers"), or implicitly is one: it doesn't resolve against
    # anything in conversation memory (no "compare", ordinal, pronoun, or
    # known name match) and isn't just a greeting/acknowledgment. Bare
    # queries like "python developer 5 years" fall in that second bucket --
    # without this fallback they'd resolve to nothing and get reported as
    # "no candidates" even when the database has real matches.
    treat_as_new_search = looks_like_new_search(message)
    if not treat_as_new_search:
        resolved_ids = resolve_referenced_candidates(state, message, candidate_store.get)
        retrieved_candidates = candidate_store.get_many(resolved_ids)
        if not retrieved_candidates and not is_conversational_filler(message):
            treat_as_new_search = True

    if treat_as_new_search:
        try:
            search_result = await run_search(message, CHAT_SEARCH_TOP_K, with_justifications=False)
        except Exception:
            logger.exception("Search pipeline failed inside chat for message=%r", message)
            raise HTTPException(status_code=502, detail="Candidate search failed.")

        summaries = [r["candidate"] for r in search_result["results"]]
        update_search_results(state, message, summaries)

        for r in search_result["results"]:
            full = candidate_store.get(r["candidate"]["id"])
            if full:
                augmented = dict(full)
                augmented["matchScore"] = r["matchScore"]
                retrieved_candidates.append(augmented)
        resolved_ids = [c["id"] for c in retrieved_candidates]
        extra_instruction = (
            "This is a fresh set of search results for the recruiter's query above. "
            "Briefly summarize the strongest matches (name, role, why they fit) and "
            "proactively suggest next steps such as comparing top candidates or "
            "viewing full profiles."
        )

    # -- 3. Interview-questions / hiring-recommendation: route through the
    #       Recommendation Agent directly so those specific asks are grounded.
    is_interview_ask = bool(_INTERVIEW_QUESTIONS_RE.search(message))
    is_hiring_ask = bool(_HIRING_RECOMMENDATION_RE.search(message))

    if (is_interview_ask or is_hiring_ask) and retrieved_candidates:
        focus = "interview_questions" if is_interview_ask else "hiring_recommendation"
        target_candidates = retrieved_candidates[:MAX_RECOMMENDATION_CANDIDATES]

        async def _analyze(candidate: dict) -> dict:
            return await asyncio.to_thread(analyze_candidate, candidate, message, focus)

        try:
            justifications = await asyncio.gather(*[_analyze(c) for c in target_candidates])
        except Exception:
            logger.exception("Recommendation Agent failed during chat for focus=%s", focus)
            raise HTTPException(status_code=502, detail="Candidate analysis failed.")

        reply_text = _format_recommendation_reply(target_candidates, justifications, focus)
        if focus == "interview_questions":
            suggestions = ["Generate hiring recommendation", "Compare Top 3", "View Candidate Profiles"]
        else:
            suggestions = ["Generate interview questions?", "Compare Top 3", "View Candidate Profiles"]

        candidate_ids = [c["id"] for c in target_candidates]
        note_candidates_discussed(state, candidate_ids)
        add_message(state, "assistant", reply_text)

        candidates_out = [candidate_to_summary(c) for c in candidate_store.get_many(candidate_ids)]
        return ChatResponse(
            session_id=state.session_id,
            reply=reply_text,
            suggestions=suggestions,
            candidate_ids=candidate_ids,
            candidates=candidates_out,
        )

    # -- 4. General flow: Prompt Builder -> Chatbot Agent ---------------------
    context_candidates = retrieved_candidates[:MAX_CHAT_CONTEXT_CANDIDATES]
    user_prompt = build_chat_user_prompt(
        message=message,
        retrieved_candidates=context_candidates,
        recent_messages=state.messages,
        last_search_query=state.last_search_query,
        extra_instruction=extra_instruction,
    )

    try:
        agent_result = await asyncio.to_thread(generate_reply, user_prompt)
    except Exception:
        logger.exception("Chatbot Agent failed for message=%r", message)
        raise HTTPException(status_code=502, detail="Chat reply generation failed.")

    reply = agent_result.get("reply", "")
    suggestions = agent_result.get("suggestions", [])
    llm_candidate_ids = [cid for cid in agent_result.get("candidateIds", []) if candidate_store.get(cid)]

    final_candidate_ids = llm_candidate_ids or resolved_ids
    note_candidates_discussed(state, final_candidate_ids)
    add_message(state, "assistant", reply)

    candidates_out = [candidate_to_summary(c) for c in candidate_store.get_many(final_candidate_ids)]

    return ChatResponse(
        session_id=state.session_id,
        reply=reply,
        suggestions=suggestions,
        candidate_ids=final_candidate_ids,
        candidates=candidates_out,
    )
