import base64
import io

import httpx
import structlog
from PIL import Image as PILImage

from pixii_api.config import settings
from pixii_api.llm import nvidia_client
from pixii_api.schemas.agent_io import InputProcessingOut

log = structlog.get_logger()

_SYSTEM_PROMPT = """\
/no_think
You are a product image analyst for an ecommerce photo enhancement pipeline.
Analyze the image and return ONLY valid JSON matching this schema exactly — no markdown, no explanation:
{
  "intent": {
    "goal": "<refined specific goal, max 20 words>",
    "marketplace": "<marketplace>",
    "style_hints": ["<hint>"],
    "audience": "<target audience, max 5 words>"
  },
  "image_quality": {
    "resolution": "<WxH>",
    "has_white_background": <true|false>,
    "is_blurry": <true|false>,
    "dominant_issues": ["<issue, max 5 words each>"]
  },
  "requires_normalization": <true|false>,
  "normalization_notes": "<one sentence, max 20 words>"
}"""


async def run(
    image: PILImage.Image,
    goal: str,
    marketplace: str,
    style_hints: list[str],
) -> InputProcessingOut:
    # Downscale to 512px — sufficient for quality analysis, reduces payload
    width, height = image.size
    thumb = image.copy()
    thumb.thumbnail((512, 512), PILImage.LANCZOS)
    buf = io.BytesIO()
    thumb.save(buf, format="JPEG", quality=80)
    img_b64 = base64.b64encode(buf.getvalue()).decode()

    user_content = [
        {"type": "text", "text": (
            f"Goal: {goal}\n"
            f"Marketplace: {marketplace}\n"
            f"Style hints: {', '.join(style_hints) or 'none'}\n"
            f"Original dimensions: {width}x{height}px\n\n"
            "Analyze the product image and return JSON as instructed."
        )},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
    ]

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    log.info("input_processing_vision_call", model=settings.nvidia_default_model, image_size=f"{width}x{height}")

    raw = await nvidia_client.chat(messages, temperature=0.15, max_tokens=512)
    log.debug("input_processing_raw_response", preview=raw[:200])

    cleaned = nvidia_client._extract_json(raw)
    return InputProcessingOut.model_validate_json(cleaned)
