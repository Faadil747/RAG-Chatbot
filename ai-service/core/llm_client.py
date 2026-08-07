"""
Single choke point for all LLM calls made by this service.

Every agent module talks to the LLM ONLY through `chat_json` / `chat_text`
defined here. If the provider ever changes, this is the only file that needs
to change -- no other module should import `groq` or `openai` directly.

Three providers are wired, selected via `settings.llm_provider` (the primary)
and `settings.llm_fallback_provider` (see core/config.py):

- "runpod" (default primary): a self-hosted Ollama instance reached through a
  RunPod proxy, called via the `openai` SDK against Ollama's OpenAI-compatible
  `/v1` routes. Model from env `RUNPOD_MODEL` (default "qwen2.5:14b").
- "deepseek" (default fallback): DeepSeek's OpenAI-compatible API, also via
  the `openai` SDK. Model from env `DEEPSEEK_MODEL`.
- "groq": Groq (https://groq.com) via the official `groq` SDK. Model from env
  `GROQ_MODEL`.

All three expose the same `client.chat.completions.create(...)` shape, so the
calling code below is provider-agnostic. If a call to the primary provider
raises (connection error, timeout, non-2xx, model not found, ...), it's logged
and retried once against the fallback provider before giving up.
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from openai import APITimeoutError, OpenAI

from core.config import settings

if TYPE_CHECKING:
    # pyrefly: ignore [missing-import]
    from groq import Groq

logger = logging.getLogger("ai-service.llm_client")

# `groq` is only ever imported (see _build_client below) if a "groq" provider
# is actually configured -- production runs DeepSeek-only, so this keeps the
# groq SDK's import weight off every process that never uses it, which
# matters on a memory-constrained deployment where every eagerly-imported
# library competes with the embedding model for the same budget.
_clients: dict[str, Groq | OpenAI] = {}


def _build_client(provider: str) -> Groq | OpenAI:
    timeout = settings.llm_request_timeout
    # max_retries=0: the SDK's own built-in retry-on-timeout/error (default
    # 2 extra attempts, each re-running the full timeout) would silently
    # multiply every timeout/empty-content case _call_with_fallback already
    # retries deliberately below -- left at the default, a single slow call
    # could balloon to 3x this client's timeout before _call_with_fallback
    # even sees the exception, on top of the retry it then adds itself.
    # This client is meant to fail fast and let _call_with_fallback decide
    # what retrying is actually worth.
    if provider == "runpod":
        return OpenAI(
            api_key=settings.runpod_api_key or "ollama",
            base_url=settings.runpod_base_url,
            timeout=timeout,
            max_retries=0,
        )
    if provider == "deepseek":
        if not settings.deepseek_api_key:
            logger.warning("DEEPSEEK_API_KEY is not set. Calls to deepseek will fail until it is configured.")
        return OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=timeout,
            max_retries=0,
        )
    if provider == "groq":
        # pyrefly: ignore [missing-import]
        from groq import Groq

        if not settings.groq_api_key:
            logger.warning("GROQ_API_KEY is not set. Calls to groq will fail until it is configured.")
        return Groq(api_key=settings.groq_api_key, timeout=timeout, max_retries=0)
    raise ValueError(f"Unknown LLM provider: {provider!r}")


def _get_client(provider: str) -> Groq | OpenAI:
    if provider not in _clients:
        _clients[provider] = _build_client(provider)
    return _clients[provider]


def _get_model(provider: str, explicit_model: str | None) -> str:
    if explicit_model:
        return explicit_model
    return {
        "runpod": settings.runpod_model,
        "deepseek": settings.deepseek_model,
        "groq": settings.groq_model,
    }[provider]


def _provider_chain() -> list[str]:
    chain = [settings.llm_provider]
    if settings.llm_fallback_provider and settings.llm_fallback_provider != settings.llm_provider:
        chain.append(settings.llm_fallback_provider)
    return chain


class _EmptyCompletionError(RuntimeError):
    """Raised when a provider returns HTTP 200 with empty content -- e.g. a
    reasoning model that spent its entire max_tokens budget on hidden
    reasoning before ever writing the actual answer."""

    def __init__(self, provider: str, finish_reason: str | None):
        self.provider = provider
        self.finish_reason = finish_reason
        super().__init__(f"Empty completion content from '{provider}' (finish_reason={finish_reason!r})")


def _completion_content(
    provider: str,
    system: str,
    user: str,
    *,
    temperature: float,
    max_tokens: int,
    model: str | None,
    json_mode: bool,
    timeout: float | None = None,
) -> str:
    client = _get_client(provider)
    use_model = _get_model(provider, model)

    kwargs: dict[str, Any] = dict(
        model=use_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if timeout is not None:
        # Per-call override of the client's configured timeout -- used only
        # by the reasoning-retry path below, which deliberately needs more
        # time than an ordinary call.
        kwargs["timeout"] = timeout

    completion = client.chat.completions.create(**kwargs)
    choice = completion.choices[0]
    content = choice.message.content or ""
    if not content:
        # A reasoning model (e.g. DeepSeek's) can spend its entire max_tokens
        # budget on internal reasoning before ever writing the answer,
        # yielding a "successful" (HTTP 200) completion with empty content
        # and finish_reason "length". Silently returning "" here would let
        # _call_with_fallback treat that as a real (if unparseable) answer
        # and never try the next provider in the chain -- raise instead so
        # the existing fallback logic actually kicks in.
        raise _EmptyCompletionError(provider, choice.finish_reason)
    return content


# A reasoning model can legitimately need more time AND more tokens than an
# ordinary call's budget on a long prompt (observed: 60-90s+, occasionally
# exhausting an 8k-token budget purely on hidden reasoning). Rather than
# treat that as "this provider is broken" and jump straight to the next
# provider in the chain, retry the SAME provider once with more of both --
# capped well below the point (observed ~16k tokens / several minutes)
# where it stops being worth waiting for.
_REASONING_RETRY_MAX_TOKENS = 14000
_REASONING_RETRY_TIMEOUT = 110.0


def _call_with_fallback(
    system: str,
    user: str,
    *,
    temperature: float,
    max_tokens: int,
    model: str | None,
    json_mode: bool,
) -> str:
    """Tries each provider in the configured chain in order, returning the
    first successful raw completion text. Raises the last error if every
    provider in the chain fails."""
    chain = _provider_chain()
    last_exc: Exception | None = None

    for i, provider in enumerate(chain):
        is_last = i + 1 == len(chain)
        retry_max_tokens: int | None = None
        retry_timeout: float | None = None

        try:
            return _completion_content(
                provider, system, user,
                temperature=temperature, max_tokens=max_tokens, model=model, json_mode=json_mode,
            )
        except _EmptyCompletionError as exc:
            last_exc = exc
            if exc.finish_reason == "length" and max_tokens < _REASONING_RETRY_MAX_TOKENS:
                # The model ran out of room -- give the SAME provider more
                # budget and time before falling back to a different one.
                retry_max_tokens = min(_REASONING_RETRY_MAX_TOKENS, int(max_tokens * 1.75))
                retry_timeout = _REASONING_RETRY_TIMEOUT
                logger.warning(
                    "LLM provider '%s' exhausted its %d-token budget on reasoning with no visible "
                    "output; retrying at %d tokens / %.0fs timeout before falling back",
                    provider, max_tokens, retry_max_tokens, retry_timeout,
                )
            else:
                # Empty content with a finish_reason other than "length"
                # (e.g. "stop") means the model itself decided it was done
                # yet produced nothing -- a bigger budget wouldn't fix that,
                # but it's also not evidence the provider is actually down.
                # One plain retry with identical parameters catches this
                # kind of one-off non-deterministic empty response instead
                # of failing the whole request on what's often a fluke.
                retry_max_tokens = max_tokens
                logger.warning(
                    "LLM provider '%s' returned empty content (finish_reason=%r) with no sign it "
                    "was a budget issue; retrying once with identical parameters before falling back",
                    provider, exc.finish_reason,
                )
        except APITimeoutError as exc:
            last_exc = exc
            # The configured request timeout is tuned for ordinary calls;
            # a reasoning model can legitimately exceed it on a long
            # prompt, which isn't the same failure as the provider being
            # down -- worth one retry with more headroom before giving up.
            if max_tokens < _REASONING_RETRY_MAX_TOKENS:
                retry_max_tokens = min(_REASONING_RETRY_MAX_TOKENS, int(max_tokens * 1.25))
                retry_timeout = _REASONING_RETRY_TIMEOUT
                logger.warning(
                    "LLM provider '%s' timed out; retrying at %d tokens / %.0fs timeout before falling back",
                    provider, retry_max_tokens, retry_timeout,
                )
        except Exception as exc:  # noqa: BLE001 -- deliberately broad: any provider failure should fall through
            last_exc = exc

        if retry_max_tokens is not None:
            try:
                return _completion_content(
                    provider, system, user,
                    temperature=temperature, max_tokens=retry_max_tokens, model=model, json_mode=json_mode,
                    timeout=retry_timeout,
                )
            except Exception as retry_exc:  # noqa: BLE001
                last_exc = retry_exc

        logger.warning(
            "LLM provider '%s' failed (%s: %s)%s",
            provider, type(last_exc).__name__, last_exc,
            "; no more providers in the chain" if is_last else "; falling back to next provider",
        )

    assert last_exc is not None
    raise last_exc


def _extract_json(raw: str) -> dict[str, Any]:
    """Best-effort extraction of a JSON object from a raw model completion.

    JSON mode should already return pure JSON, but we defend against stray
    markdown fences or leading/trailing prose just in case.
    """
    text = raw.strip()
    if text.startswith("```"):
        # strip ```json ... ``` or ``` ... ``` fences
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: grab the widest {...} span in the text.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        return json.loads(candidate)

    raise ValueError("Could not parse JSON from LLM response")


def chat_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.2,
    max_tokens: int = 8192,
    model: str | None = None,
) -> dict[str, Any]:
    """Send a system+user prompt to the LLM and parse a JSON object back.

    Requests JSON-mode (`response_format={"type": "json_object"}`) so the
    model is constrained to emit valid JSON. On a parse failure, retries
    exactly once with a sterner instruction appended to the user prompt
    (still going through the full provider fallback chain).

    max_tokens defaults higher than the more typical 2-4k because our
    primary provider's model reasons internally before answering (its
    `reasoning_content`, which we never read), and that reasoning eats into
    the same token budget as the actual JSON content. Observed in practice:
    one ordinary resume-parsing call spent ~5500 tokens "thinking" before
    writing ~1600 tokens of real output -- and that reasoning length is
    non-deterministic per call, so a tighter budget intermittently produces
    an empty completion (finish_reason "length", zero content) instead of a
    parse error, which retrying with a sterner prompt cannot fix since the
    problem was never the prompt wording. Deliberately NOT pushed higher
    than this: raising the ceiling further just gives the model room to
    reason even longer (observed calls taking 60-90s+ at 16384), trading
    reliability for latency that compounds badly across the 3 sequential
    calls a single resume upload makes.
    """
    raw = _call_with_fallback(system, user, temperature=temperature, max_tokens=max_tokens, model=model, json_mode=True)
    try:
        return _extract_json(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("chat_json: first parse attempt failed (%s); retrying once", exc)
        stricter_user = (
            user
            + "\n\nIMPORTANT: Your previous response was not valid JSON. "
            "Respond with ONLY a single valid JSON object, no markdown fences, "
            "no commentary, no trailing text."
        )
        raw_retry = _call_with_fallback(
            system, stricter_user, temperature=temperature, max_tokens=max_tokens, model=model, json_mode=True
        )
        try:
            return _extract_json(raw_retry)
        except (ValueError, json.JSONDecodeError) as exc2:
            logger.error("chat_json: retry also failed to parse: %s", exc2)
            raise


def chat_text(
    system: str,
    user: str,
    *,
    temperature: float = 0.3,
    max_tokens: int = 2048,
    model: str | None = None,
) -> str:
    """Send a system+user prompt to the LLM and return the raw text reply.

    Provided for completeness/provider-agnosticism; most agents in this
    service use `chat_json` since every endpoint needs structured output.
    """
    return _call_with_fallback(system, user, temperature=temperature, max_tokens=max_tokens, model=model, json_mode=False)
