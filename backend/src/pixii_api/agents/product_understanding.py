import base64

import structlog

from pixii_api.llm import nvidia_client
from pixii_api.schemas.agent_io import InputProcessingOut, ProductUnderstandingOut

log = structlog.get_logger()

_SYSTEM_PROMPT = """\
/no_think
You are a product analyst. Look at the actual image and identify the physical product.
Return ONLY valid JSON — no markdown, no explanation:
{
  "product": {
    "category": "<broad category>",
    "subcategory": "<specific type>",
    "materials": ["<material1>", "<material2>"],
    "colors": ["<color1>", "<color2>"],
    "brand_text": ["<visible brand or logo text, empty list if none>"],
    "distinctive_features": ["<feature1>", "<feature2>"],
    "product_summary": "<one sentence, 15 words max, describing the physical object>"
  }
}"""


async def run(
    processing: InputProcessingOut,
    prior_product_description: str = "",
    image_bytes: bytes | None = None,
    image_mime: str = "image/jpeg",
) -> ProductUnderstandingOut:
    context_text = (
        f"Goal: {processing.intent.goal}\n"
        f"Marketplace: {processing.intent.marketplace}\n"
    )
    if prior_product_description:
        context_text += f"Prior description: {prior_product_description}\n"
    context_text += "\nLook at the image and identify the product. Return JSON as instructed."

    if image_bytes:
        img_b64 = base64.b64encode(image_bytes).decode()
        user_content = [
            {"type": "text", "text": context_text},
            {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{img_b64}"}},
        ]
    else:
        user_content = context_text  # type: ignore[assignment]

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    log.debug("product_understanding_vision_call", has_image=image_bytes is not None)
    raw = await nvidia_client.chat(messages, temperature=0.2, max_tokens=512)
    cleaned = nvidia_client._extract_json(raw)
    return ProductUnderstandingOut.model_validate_json(cleaned)
