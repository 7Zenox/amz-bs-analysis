import base64

import httpx
import structlog
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from pixii_api.config import settings

log = structlog.get_logger()

_client: httpx.AsyncClient | None = None

def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=300.0)
    return _client


def _is_retryable(exc: BaseException) -> bool:
    """Only retry on 5xx and network errors — never on 4xx (permanent failures)."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return True


def _build_prompt(prompt: str, negative_prompt: str) -> str:
    """Combine prompt and negative prompt."""
    full = prompt
    if negative_prompt:
        full += f". Avoid: {negative_prompt}"
    return full


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=30),
    retry=retry_if_exception(_is_retryable),
    reraise=True,
)
async def generate_image(
    prompt: str,
    negative_prompt: str = "",
    reference_image_bytes: bytes | None = None,
    reference_mime: str = "image/jpeg",
) -> tuple[bytes, str]:
    """Generate image using NVIDIA Flux. Returns (image_bytes, mime_type)."""
    client = get_client()

    full_prompt = _build_prompt(prompt, negative_prompt)

    payload: dict = {
        "prompt": full_prompt,
        "width": 1024,
        "height": 1024,
        "seed": 0,
        "steps": 4,
    }

    invoke_url = f"{settings.nvidia_image_base_url}/{settings.nvidia_image_model}"
    headers = {
        "Authorization": f"Bearer {settings.nvidia_image_api_key}",
        "Accept": "application/json",
    }

    log.info("nvidia_image_generate_start", model=settings.nvidia_image_model, prompt_len=len(full_prompt))

    try:
        response = await client.post(invoke_url, json=payload, headers=headers)
        log.info("nvidia_image_response_received", status=response.status_code)
        response.raise_for_status()
        data = response.json()
        log.info("nvidia_image_response_body", keys=list(data.keys()), raw=str(data)[:500])
    except httpx.HTTPStatusError as e:
        log.error("nvidia_image_request_failed", status=e.response.status_code, error=str(e), url=invoke_url, response_body=e.response.text[:300])
        raise
    except Exception as e:
        log.error("nvidia_image_request_failed", error=str(e), error_type=type(e).__name__, url=invoke_url)
        raise

    if "artifacts" in data and len(data["artifacts"]) > 0:
        artifact = data["artifacts"][0]
        finish_reason = artifact.get("finishReason", "")

        if finish_reason == "CONTENT_FILTERED":
            log.warning("nvidia_image_content_filtered", prompt_preview=full_prompt[:100])
            raise ValueError("Flux content filter triggered — prompt contains restricted content")

        b64_image = artifact.get("base64", "")
        if b64_image:
            try:
                image_bytes = base64.b64decode(b64_image)
                return image_bytes, "image/jpeg"
            except Exception as exc:
                log.error("nvidia_image_decode_error", error=str(exc))
                raise ValueError(f"Failed to decode base64 image: {exc}") from exc

        log.error("nvidia_image_empty_base64", finish_reason=finish_reason)
    else:
        log.error("nvidia_image_no_artifacts", data=str(data)[:300])

    raise ValueError("NVIDIA Flux returned no image in response")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=30),
    retry=retry_if_exception(_is_retryable),
    reraise=True,
)
async def edit_image(
    image_bytes: bytes,
    image_mime: str,
    prompt: str,
    negative_prompt: str = "",
) -> tuple[bytes, str]:
    """Edit mode: Flux doesn't support inpainting, so generate fresh with the prompt."""
    full_prompt = _build_prompt(prompt, negative_prompt)
    return await generate_image(full_prompt, "", None, "image/jpeg")
