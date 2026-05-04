"""Unit tests for the NVIDIA client: JSON extraction, chat, and chat_json."""
import json
import os

import httpx
import pytest
import respx
from pydantic import BaseModel

os.environ.setdefault("NVIDIA_API_KEY", "test-key")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from pixii_api.llm import nvidia_client  # noqa: E402


class DemoSchema(BaseModel):
    answer: str
    score: int


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_response(content: str) -> dict:
    return {
        "choices": [
            {"message": {"role": "assistant", "content": content}}
        ]
    }


# ── _extract_json ─────────────────────────────────────────────────────────────

def test_extract_json_plain():
    raw = '{"answer": "hello", "score": 5}'
    assert nvidia_client._extract_json(raw) == raw


def test_extract_json_strips_markdown_fence():
    raw = '```json\n{"answer": "hello", "score": 5}\n```'
    result = nvidia_client._extract_json(raw)
    assert result == '{"answer": "hello", "score": 5}'


def test_extract_json_strips_plain_fence():
    raw = '```\n{"answer": "hi", "score": 1}\n```'
    result = nvidia_client._extract_json(raw)
    assert result == '{"answer": "hi", "score": 1}'


def test_extract_json_finds_first_brace():
    raw = 'Sure! Here is the JSON: {"answer": "ok", "score": 3}'
    result = nvidia_client._extract_json(raw)
    assert result.startswith('{"answer"')


# ── chat ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@respx.mock
async def test_chat_returns_content():
    # Reset the cached client so respx can intercept
    nvidia_client._client = None

    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_make_response("Hello from kimi"))
    )

    result = await nvidia_client.chat(
        [{"role": "user", "content": "hi"}],
            )
    assert result == "Hello from kimi"
    nvidia_client._client = None  # cleanup


@pytest.mark.asyncio
@respx.mock
async def test_chat_raises_on_4xx():
    # tenacity wraps repeated failures in RetryError; check the cause is HTTPStatusError
    nvidia_client._client = None

    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": "unauthorized"})
    )

    from tenacity import RetryError
    with pytest.raises((httpx.HTTPStatusError, RetryError)):
        await nvidia_client.chat([{"role": "user", "content": "hi"}])
    nvidia_client._client = None


# ── chat_json ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@respx.mock
async def test_chat_json_parses_valid_response():
    nvidia_client._client = None
    payload = json.dumps({"answer": "blue", "score": 9})

    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_make_response(payload))
    )

    result = await nvidia_client.chat_json(
        [{"role": "user", "content": "What color?"}],
        DemoSchema,
    )
    assert result.answer == "blue"
    assert result.score == 9
    nvidia_client._client = None


@pytest.mark.asyncio
@respx.mock
async def test_chat_json_retries_on_bad_json():
    """First response is malformed; second (repair) response is valid."""
    nvidia_client._client = None
    good_payload = json.dumps({"answer": "repaired", "score": 7})

    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(200, json=_make_response("not valid json at all"))
        return httpx.Response(200, json=_make_response(good_payload))

    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(side_effect=handler)

    result = await nvidia_client.chat_json(
        [{"role": "user", "content": "test"}],
        DemoSchema,
    )
    assert result.answer == "repaired"
    assert call_count == 2
    nvidia_client._client = None


@pytest.mark.asyncio
@respx.mock
async def test_chat_json_parses_fenced_json():
    nvidia_client._client = None
    fenced = "```json\n{\"answer\": \"fenced\", \"score\": 2}\n```"

    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_make_response(fenced))
    )

    result = await nvidia_client.chat_json(
        [{"role": "user", "content": "fence test"}],
        DemoSchema,
    )
    assert result.answer == "fenced"
    nvidia_client._client = None
