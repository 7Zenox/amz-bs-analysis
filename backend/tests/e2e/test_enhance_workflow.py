"""
End-to-end workflow test: POST /enhance with all 11 agents and Gemini mocked.
Verifies the full pipeline runs without error and returns a valid EnhanceResponse.
"""
import base64
import io
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

os.environ.setdefault("NVIDIA_API_KEY", "test-key")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from pixii_api.main import app  # noqa: E402
from pixii_api.schemas.agent_io import (  # noqa: E402
    BackgroundSpec,
    CandidatePlan,
    CandidateScores,
    CompositionSpec,
    ConstraintModelingOut,
    ExportPlannerOut,
    ExportVariant,
    FailureAnalysisOut,
    FidelityGuardrailOut,
    FidelityRule,
    ImageQualityReport,
    InputProcessingOut,
    LightingSpec,
    MarketplaceRule,
    OutputReviewOut,
    ProductDescriptor,
    ProductUnderstandingOut,
    PromptCompositionOut,
    PromptDelta,
    StructuredIntent,
    WorkflowPlannerOut,
)


# ── fixtures ──────────────────────────────────────────────────────────────────

def _make_jpeg(width: int = 200, height: int = 200) -> bytes:
    img = Image.new("RGB", (width, height), color=(200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _png_bytes() -> bytes:
    img = Image.new("RGB", (512, 512), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# Canned agent outputs

_INPUT_PROCESSING = InputProcessingOut(
    intent=StructuredIntent(
        goal="Create professional studio product image",
        marketplace="amazon",
        style_hints=["clean", "white background"],
        audience="online shoppers",
    ),
    image_quality=ImageQualityReport(
        resolution="200x200",
        has_white_background=False,
        is_blurry=False,
        dominant_issues=["low resolution", "cluttered background"],
    ),
    requires_normalization=True,
    normalization_notes="resize and strip EXIF",
)

_PRODUCT_UNDERSTANDING = ProductUnderstandingOut(
    product=ProductDescriptor(
        category="Health & Beauty",
        subcategory="Supplements",
        materials=["plastic", "cardboard"],
        colors=["white", "blue"],
        brand_text=["BrandX"],
        distinctive_features=["cylindrical bottle", "blue cap"],
        product_summary="White plastic supplement bottle with blue cap and BrandX label",
    )
)

_FIDELITY = FidelityGuardrailOut(
    must_preserve=[
        FidelityRule(attribute="BrandX label text", importance=5, rationale="brand compliance"),
        FidelityRule(attribute="bottle silhouette", importance=4, rationale="product identity"),
    ],
    confidence=0.9,
    warnings=[],
)

_CONSTRAINTS = ConstraintModelingOut(
    composition=CompositionSpec(angle="front", framing="centered", negative_space="large"),
    lighting=LightingSpec(
        style="soft studio", key_light="top-left", fill_light="right", shadow_type="soft drop shadow"
    ),
    background=BackgroundSpec(style="seamless", color="pure white #FFFFFF", texture="none"),
    marketplace_rules=[MarketplaceRule(rule="white background required", rationale="Amazon policy")],
)

_WORKFLOW_PLAN = WorkflowPlannerOut(
    plans=[
        CandidatePlan(
            index=0,
            mode="generate",
            description="Front-facing hero shot",
            angle_variation="straight on",
            lighting_variation="soft box",
            seed_hint="clean studio",
        ),
        CandidatePlan(
            index=1,
            mode="edit",
            description="Three-quarter angle",
            angle_variation="3/4 right",
            lighting_variation="ring light",
            seed_hint="subtle shadow",
        ),
    ],
    strategy_rationale="Two diverse angles for better marketplace coverage",
)

_PROMPT_COMPOSITION = PromptCompositionOut(
    image_prompt=(
        "Professional ecommerce studio photograph of a white plastic supplement bottle "
        "with blue cap and BrandX label. Pure white seamless background. "
        "Soft box lighting from top-left. Product centered and filling 85% of frame."
    ),
    negative_prompt="no props, no reflections, no text changes, no background clutter",
    style_guidance="Clean minimalist studio product photography",
)

_REVIEW_PASS = OutputReviewOut(
    scores=CandidateScores(fidelity=0.9, aesthetic=0.85, constraint_compliance=0.92, overall=0.89),
    passed=True,
    issues=[],
    pass_rationale="Image meets all constraints and fidelity rules",
)

_FAILURE_ANALYSIS = FailureAnalysisOut(
    root_causes=["prompt too vague"],
    prompt_deltas=PromptDelta(
        add_to_prompt=["add more detail about label"],
        remove_from_prompt=[],
        strengthen_negative=["no background clutter"],
    ),
    switch_mode=False,
    new_mode=None,
)

_EXPORT_PLAN = ExportPlannerOut(
    variants=[
        ExportVariant(
            name="Amazon Main Image",
            width=2000,
            height=2000,
            format="jpeg",
            background="pure white",
            crop_notes="product fills 85% of frame",
        ),
        ExportVariant(
            name="Amazon Secondary",
            width=1000,
            height=1000,
            format="jpeg",
            background="pure white",
            crop_notes="standard crop",
        ),
    ],
    primary_variant="Amazon Main Image",
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _agent_mock(return_value):
    return AsyncMock(return_value=return_value)


# ── test ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_enhance_full_pipeline():
    """
    Full pipeline test: POST /enhance with a sample JPEG.
    All 11 NVIDIA agent calls and both Gemini calls are mocked.
    Validates response structure, candidate count, and score fields.
    """
    jpeg_bytes = _make_jpeg()
    gen_png = _png_bytes()

    with (
        patch("pixii_api.agents.input_processing.run", _agent_mock(_INPUT_PROCESSING)),
        patch("pixii_api.agents.product_understanding.run", _agent_mock(_PRODUCT_UNDERSTANDING)),
        patch("pixii_api.agents.fidelity_guardrail.run", _agent_mock(_FIDELITY)),
        patch("pixii_api.agents.constraint_modeling.run", _agent_mock(_CONSTRAINTS)),
        patch("pixii_api.agents.workflow_planner.run", _agent_mock(_WORKFLOW_PLAN)),
        patch("pixii_api.agents.prompt_composition.run", _agent_mock(_PROMPT_COMPOSITION)),
        patch("pixii_api.agents.output_review.run", _agent_mock(_REVIEW_PASS)),
        patch("pixii_api.agents.failure_analysis.run", _agent_mock(_FAILURE_ANALYSIS)),
        patch("pixii_api.agents.export_planner.run", _agent_mock(_EXPORT_PLAN)),
        patch(
            "pixii_api.llm.gemini_client.generate_image",
            AsyncMock(return_value=(gen_png, "image/png")),
        ),
        patch(
            "pixii_api.llm.gemini_client.edit_image",
            AsyncMock(return_value=(gen_png, "image/png")),
        ),
    ):
        with TestClient(app, raise_server_exceptions=True) as client:
            response = client.post(
                "/enhance",
                files={"file": ("product.jpg", jpeg_bytes, "image/jpeg")},
                data={
                    "goal": "Create a professional studio product image for Amazon",
                    "marketplace": "amazon",
                    "style_hints": "clean, minimalist",
                    "n_candidates": "2",
                    "state_json": "{}",
                },
                timeout=60,
            )

    assert response.status_code == 200, response.text
    body = response.json()

    # Top-level keys
    assert "candidates" in body
    assert "updated_state" in body
    assert "export_variants" in body
    assert "duration_ms" in body
    assert "attempts" in body

    # Candidates
    candidates = body["candidates"]
    assert len(candidates) == 2

    for candidate in candidates:
        assert "image_b64" in candidate
        assert candidate["passed"] is True
        assert candidate["mime_type"] == "image/png"
        assert candidate["width"] > 0
        assert candidate["height"] > 0

        scores = candidate["scores"]
        assert scores["overall"] > 0.0
        assert scores["fidelity"] > 0.0

        # image_b64 should be valid base64 decodable to PNG bytes
        decoded = base64.b64decode(candidate["image_b64"])
        assert decoded == gen_png

    # Updated state
    state = body["updated_state"]
    assert state["product_description"] != ""
    assert len(state["fidelity_rules"]) >= 2

    # Export variants
    variants = body["export_variants"]
    assert len(variants) == 2
    assert variants[0]["name"] == "Amazon Main Image"
    assert variants[0]["width"] == 2000

    # Timing
    assert body["duration_ms"] >= 0
    assert body["attempts"] >= 2  # one per plan
