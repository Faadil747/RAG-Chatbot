"""
Chatbot Agent: the final LLM call in the /ai/chat pipeline. Takes the
system/user prompt assembled by rag/prompt_builder.py and returns the
reply/suggestions/candidateIds the recruiter sees.
"""
from __future__ import annotations

from core.llm_client import chat_json
from rag.prompt_builder import CHATBOT_SYSTEM_PROMPT


def generate_reply(user_prompt: str) -> dict:
    result = chat_json(CHATBOT_SYSTEM_PROMPT, user_prompt, temperature=0.4)
    result.setdefault("reply", "")
    result.setdefault("suggestions", [])
    result.setdefault("candidateIds", [])
    return result
