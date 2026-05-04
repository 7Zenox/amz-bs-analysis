import base64
import json

import structlog

from pixii_api.llm import nvidia_client
from pixii_api.schemas.agent_io import (
    CandidatePlan,
    ConstraintModelingOut,
    FidelityGuardrailOut,
    ProductUnderstandingOut,
    PromptCompositionOut,
    PromptDelta,
)

log = structlog.get_logger()

_SYSTEM_PROMPT = """\
/no_think
You are composing a concise image generation prompt for a Flux diffusion model.
You are given the actual source product image for reference.
Return ONLY valid JSON — no markdown, no explanation:
{
  "image_prompt": "<dense keyword-rich prompt, max 60 words, NO brand names or trademarks, describe physical object only>",
  "negative_prompt": "<what to avoid, max 20 words, no brand names>",
  "style_guidance": "<one sentence on visual feel>"
}"""


async def run(
    plan: CandidatePlan,
    product: ProductUnderstandingOut,
    constraints: ConstraintModelingOut,
    fidelity: FidelityGuardrailOut,
    image_bytes: bytes,
    image_mime: str = "image/jpeg",
    prompt_deltas: PromptDelta | None = None,
) -> PromptCompositionOut:
    img_b64 = base64.b64encode(image_bytes).decode()

    context_text = (
        f"Candidate plan: {plan.description}, angle={plan.angle_variation}, lighting={plan.lighting_variation}, mode={plan.mode}\n"
        f"Product: {product.product.category} — {product.product.subcategory or ''}\n"
        f"Materials: {', '.join(product.product.materials)}\n"
        f"Colors: {', '.join(product.product.colors)}\n"
        f"Features: {', '.join(product.product.distinctive_features)}\n"
        f"Composition: {constraints.composition.angle}, {constraints.composition.framing}\n"
        f"Lighting: {constraints.lighting.style}, {constraints.lighting.shadow_type}\n"
        f"Background: {constraints.background.color}\n"
        f"Preserve: {', '.join(r.attribute for r in fidelity.must_preserve)}\n"
    )
    if prompt_deltas:
        context_text += f"Refinements: {'; '.join(prompt_deltas.add_to_prompt)}\n"

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": context_text},
            {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{img_b64}"}},
        ]},
    ]

    log.debug("prompt_composition_vision_call", plan=plan.index, mode=plan.mode)
    raw = await nvidia_client.chat(messages, temperature=0.3, max_tokens=512)
    cleaned = nvidia_client._extract_json(raw)
    return PromptCompositionOut.model_validate_json(cleaned)
