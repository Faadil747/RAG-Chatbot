"""
Centralized service configuration, loaded once from environment variables / .env.

Every other module that needs an env-driven value should import `settings`
from here rather than calling `os.environ` directly.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the ai-service root regardless of the process's cwd.
_ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT_DIR / ".env")


class Settings:
    def __init__(self) -> None:
        self.port: int = int(os.getenv("PORT", "8000"))
        self.groq_api_key: str = os.getenv("GROQ_API_KEY", "")
        self.groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

        # Three OpenAI-compatible-ish providers are wired in core/llm_client.py:
        # "runpod" (a self-hosted Ollama instance, OpenAI-compatible at /v1),
        # "deepseek", and "groq" (via its own SDK). LLM_PROVIDER is the primary;
        # if a call to it fails outright (connection error, timeout, non-2xx),
        # llm_client automatically retries once against LLM_FALLBACK_PROVIDER --
        # no other file needs to change, per the provider-agnostic design.
        self.runpod_base_url: str = os.getenv(
            "RUNPOD_BASE_URL", "https://cunal55n586wwk-11434.proxy.runpod.net/v1"
        )
        self.runpod_model: str = os.getenv("RUNPOD_MODEL", "qwen2.5:14b")
        self.runpod_api_key: str = os.getenv("RUNPOD_API_KEY", "ollama")

        self.deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
        self.deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
        self.deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

        self.llm_provider: str = os.getenv("LLM_PROVIDER", "runpod").strip().lower()
        self.llm_fallback_provider: str = os.getenv("LLM_FALLBACK_PROVIDER", "deepseek").strip().lower()

        # Per-call request timeout for LLM providers. Without this, the
        # OpenAI SDK's ~600s default means a cold-starting/stuck provider
        # (e.g. an idled RunPod serverless pod) hangs far longer than the
        # Node backend's own 60s timeout on /ai/chat and /ai/search, instead
        # of failing fast into the provider fallback chain below.
        self.llm_request_timeout: float = float(os.getenv("LLM_REQUEST_TIMEOUT", "20"))

        self.embedding_model: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
        self.data_dir: Path = Path(os.getenv("DATA_DIR", "./data")).resolve()
        self.cors_origin: str = os.getenv("CORS_ORIGIN", "http://localhost:4000")

        self.data_dir.mkdir(parents=True, exist_ok=True)

    @property
    def faiss_index_path(self) -> Path:
        return self.data_dir / "faiss.index"

    @property
    def vector_ids_path(self) -> Path:
        return self.data_dir / "vector_ids.json"

    @property
    def candidates_store_path(self) -> Path:
        return self.data_dir / "candidates_store.json"


settings = Settings()
