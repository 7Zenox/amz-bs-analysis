import json
import re
from typing import Any, TypeVar

import httpx
import structlog
from pydantic import BaseModel
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from pixii_api.config import settings

log = structlog.get_logger()
T = TypeVar("T", bound=BaseModel)

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.nvidia_base_url,
            headers={
                "Authorization": f"Bearer {settings.nvidia_api_key}",
                "Content-Type": "application/json",
            },
            timeout=300.0,  # 5 minutes for LLM API calls
        )
    return _client


def _extract_json(text: str) -> str:
    # Strip markdown code fences if present
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        return match.group(1).strip()
    # Try to find first { ... } block
    start = text.find("{")
    if start != -1:
        return text[start:]
    return text


def _is_retryable(exc: BaseException) -> bool:
    """Only retry on network errors and 5xx; never retry on 4xx (permanent failures)."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return True


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(_is_retryable),
    reraise=True,
)
async def chat(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_tokens: int = 16384,
    temperature: float = 0.7,
) -> str:
    model = model or settings.nvidia_default_model
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 1.0,
        "frequency_penalty": 0,
        "presence_penalty": 0,
        "stream": False,
    }

    client = get_client()
    response = await client.post("/chat/completions", json=payload)
    log.debug("nvidia_response", status=response.status_code, model=model)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    reraise=True,
)
async def chat_json(
    messages: list[dict[str, Any]],
    schema: type[T],
    *,
    model: str | None = None,
) -> T:
    schema_str = json.dumps(schema.model_json_schema(), indent=2)
    system_msg = {
        "role": "system",
        "content": (
            f"/no_think\n"
            f"You must respond with valid JSON that matches this schema exactly. "
            f"No markdown, no explanation, only JSON.\n\nSchema:\n{schema_str}"
        ),
    }
    full_messages = [system_msg, *messages]

    raw = await chat(full_messages, model=model, temperature=0.3, max_tokens=4096)
    cleaned = _extract_json(raw)

    try:
        return schema.model_validate_json(cleaned)
    except Exception as exc:
        log.warning("json_parse_failed", error=str(exc), raw=raw[:500])
        # Retry with error appended
        repair_messages = [
            *full_messages,
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    f"That response failed validation: {exc}. "
                    "Return only valid JSON matching the schema."
                ),
            },
        ]
        repair_raw = await chat(repair_messages, model=model, temperature=0.1, max_tokens=4096)
        return schema.model_validate_json(_extract_json(repair_raw))
