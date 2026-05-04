import time

import structlog

from pixii_api.agents import (
    constraint_modeling,
    fidelity_guardrail,
    input_processing,
    product_understanding,
    prompt_composition,
    workflow_planner,
)
from pixii_api.config import settings
from pixii_api.llm import nvidia_image_client
from pixii_api.schemas.agent_io import ExportVariant
from pixii_api.schemas.enhance import CandidateOut, EnhanceResponse
from pixii_api.schemas.session_state import SessionState
from pixii_api.services import image_utils, state_store

log = structlog.get_logger()

# Hardcoded export variants by marketplace — no LLM call needed
_EXPORT_VARIANTS: dict[str, list[ExportVariant]] = {
    "amazon": [
        ExportVariant(name="Main Image", width=2000, height=2000, format="jpeg", background="pure white", crop_notes="product fills 85% of frame"),
        ExportVariant(name="Secondary", width=1000, height=1000, format="jpeg", background="pure white", crop_notes="standard crop"),
        ExportVariant(name="Thumbnail", width=500, height=500, format="jpeg", background="pure white", crop_notes="centered"),
    ],
    "shopify": [
        ExportVariant(name="Hero", width=2048, height=2048, format="jpeg", background="white or lifestyle", crop_notes="product centered"),
        ExportVariant(name="Collection", width=1024, height=1024, format="jpeg", background="white or lifestyle", crop_notes="standard"),
    ],
    "etsy": [
        ExportVariant(name="Listing Main", width=2000, height=2000, format="jpeg", background="clean or lifestyle", crop_notes="product prominent"),
        ExportVariant(name="Listing Thumbnail", width=800, height=800, format="jpeg", background="clean or lifestyle", crop_notes="tight crop"),
    ],
    "generic": [
        ExportVariant(name="Standard", width=1200, height=1200, format="jpeg", background="white", crop_notes="centered"),
        ExportVariant(name="Thumbnail", width=600, height=600, format="jpeg", background="white", crop_notes="tight"),
    ],
}


def _export_variants(marketplace: str) -> list[ExportVariant]:
    return _EXPORT_VARIANTS.get(marketplace.lower(), _EXPORT_VARIANTS["generic"])


async def run(
    image_bytes: bytes,
    image_mime: str,
    goal: str,
    marketplace: str,
    style_hints: list[str],
    state: SessionState,
    n_candidates: int | None = None,
) -> EnhanceResponse:
    started = time.monotonic()
    n = n_candidates or settings.n_candidates

    # --- Normalize image ---
    pil_image = image_utils.from_bytes(image_bytes)
    pil_image = image_utils.normalize(pil_image)
    norm_bytes = image_utils.to_bytes(pil_image, fmt="JPEG")

    log.info("pipeline_start", goal=goal, marketplace=marketplace, n_candidates=n)

    # --- Stage 1: Understand ---
    processing = await input_processing.run(pil_image, goal, marketplace, style_hints)
    log.info("input_processing_done",
        intent=processing.intent.goal,
        has_white_bg=processing.image_quality.has_white_background,
        issues=processing.image_quality.dominant_issues,
        normalization_notes=processing.normalization_notes,
    )

    product = await product_understanding.run(
        processing, state.product_description,
        image_bytes=norm_bytes, image_mime="image/jpeg",
    )
    log.info("product_understanding_done",
        category=product.product.category,
        subcategory=product.product.subcategory,
        colors=product.product.colors,
        materials=product.product.materials,
        brand_text=product.product.brand_text,
        features=product.product.distinctive_features,
        summary=product.product.product_summary,
    )

    fidelity = await fidelity_guardrail.run(
        product,
        processing.intent,
        state.fidelity_rules or None,
    )
    log.info("fidelity_guardrail_done",
        rules=len(fidelity.must_preserve),
        attributes=[r.attribute for r in fidelity.must_preserve],
    )

    constraints = await constraint_modeling.run(
        product,
        processing.intent,
        state.positive_intent,
        state.negative_intent,
    )
    log.info("constraint_modeling_done",
        angle=constraints.composition.angle,
        lighting=constraints.lighting.style,
        background=constraints.background.color,
    )

    updated_state = state_store.update_from_agents(state, product, fidelity)

    # --- Stage 2: Plan ---
    planner_out = await workflow_planner.run(
        product,
        constraints,
        fidelity,
        n_candidates=n,
        strategy=updated_state.strategy,
    )
    log.info("workflow_planner_done",
        plans=len(planner_out.plans),
        modes=[p.mode for p in planner_out.plans],
        descriptions=[p.description for p in planner_out.plans],
    )

    # --- Stage 3: Compose prompt + generate (no review/retry loop) ---
    candidates: list[CandidateOut] = []
    total_attempts = 0

    for plan in planner_out.plans:
        total_attempts += 1

        composed = await prompt_composition.run(
            plan, product, constraints, fidelity,
            image_bytes=norm_bytes, image_mime="image/jpeg",
            prompt_deltas=None,
        )
        log.info("prompt_composition_done",
            plan=plan.index,
            mode=plan.mode,
            image_prompt=composed.image_prompt,
            negative_prompt=composed.negative_prompt,
        )

        try:
            if plan.mode == "edit":
                img_bytes, img_mime = await nvidia_image_client.edit_image(
                    norm_bytes, "image/jpeg",
                    composed.image_prompt,
                    composed.negative_prompt,
                )
            else:
                img_bytes, img_mime = await nvidia_image_client.generate_image(
                    composed.image_prompt,
                    composed.negative_prompt,
                    norm_bytes,
                    "image/jpeg",
                )
        except Exception as exc:
            log.error("image_generation_failed", plan=plan.index, error=str(exc), error_type=type(exc).__name__)
            raise

        gen_image = image_utils.from_bytes(img_bytes)
        gen_w, gen_h = image_utils.dimensions(gen_image)
        log.info("image_generated", plan=plan.index, width=gen_w, height=gen_h)

        candidates.append(CandidateOut(
            index=plan.index,
            image_b64=image_utils.to_b64(img_bytes),
            mime_type=img_mime,
            width=gen_w,
            height=gen_h,
        ))

    duration_ms = int((time.monotonic() - started) * 1000)
    log.info("pipeline_done", candidates=len(candidates), duration_ms=duration_ms)

    return EnhanceResponse(
        candidates=candidates,
        updated_state=updated_state,
        export_variants=_export_variants(marketplace),
        duration_ms=duration_ms,
        attempts=total_attempts,
    )
