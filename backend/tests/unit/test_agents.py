"""
Unit tests for all pipeline agents.
Each agent's run() is tested by mocking run_agent and verifying:
  - correct template name is used
  - correct context keys are passed
  - the return value is forwarded unchanged
"""
import io
import json
import os
from unittest.mock import AsyncMock, patch, call

import pytest
from PIL import Image

os.environ.setdefault("NVIDIA_API_KEY", "test-key")
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("NVIDIA_IMAGE_API_KEY", "test-key")

from pixii_api.schemas.agent_io import (  # noqa: E402
    BackgroundSpec,
    CandidatePlan,
    CandidateScores,
    CompositionSpec,
    ConstraintModelingOut,
    FidelityGuardrailOut,
    FidelityRule,
    ImageQualityReport,
    InputProcessingOut,
    LightingSpec,
    MarketplaceRule,
    ProductDescriptor,
    ProductUnderstandingOut,
    PromptCompositionOut,
    PromptDelta,
    StructuredIntent,
    WorkflowPlannerOut,
)
from pixii_api.schemas.session_state import FidelityRule as SessionFidelityRule, IntentItem


# ── shared fixtures ────────────────────────────────────────────────────────────

def _make_pil_image() -> Image.Image:
    img = Image.new("RGB", (200, 200), color=(128, 128, 128))
    return img


_INTENT = StructuredIntent(
    goal="Professional studio product photo",
    marketplace="amazon",
    style_hints=["clean", "white background"],
    audience="online shoppers",
)

_IMAGE_QUALITY = ImageQualityReport(
    resolution="200x200",
    has_white_background=False,
    is_blurry=False,
    dominant_issues=["cluttered background"],
)

_INPUT_PROCESSING_OUT = InputProcessingOut(
    intent=_INTENT,
    image_quality=_IMAGE_QUALITY,
    requires_normalization=True,
    normalization_notes="resize needed",
)

_PRODUCT_DESCRIPTOR = ProductDescriptor(
    category="Electronics",
    subcategory="Audio",
    materials=["plastic", "silicone"],
    colors=["black", "silver"],
    brand_text=["BrandX"],
    distinctive_features=["round shape", "USB-C port"],
    product_summary="Black plastic wireless speaker with silver accents",
)

_PRODUCT_OUT = ProductUnderstandingOut(product=_PRODUCT_DESCRIPTOR)

_FIDELITY_OUT = FidelityGuardrailOut(
    must_preserve=[
        FidelityRule(attribute="product silhouette", importance=5, rationale="defines product identity"),
        FidelityRule(attribute="color accuracy", importance=4, rationale="brand compliance"),
    ],
    confidence=0.9,
)

_CONSTRAINTS_OUT = ConstraintModelingOut(
    composition=CompositionSpec(angle="front", framing="centered", negative_space="large"),
    lighting=LightingSpec(style="soft studio", key_light="top-left", fill_light="right", shadow_type="soft drop"),
    background=BackgroundSpec(style="seamless", color="pure white", texture="none"),
    marketplace_rules=[MarketplaceRule(rule="white background required", rationale="Amazon policy")],
)

_PLAN = CandidatePlan(
    index=0,
    mode="generate",
    description="Hero shot",
    angle_variation="front",
    lighting_variation="soft box",
    seed_hint="clean studio",
)

_WORKFLOW_OUT = WorkflowPlannerOut(
    plans=[_PLAN],
    strategy_rationale="Single hero shot for catalog",
)

_PROMPT_OUT = PromptCompositionOut(
    image_prompt="Black plastic wireless speaker, silver accents, white seamless background, soft studio lighting",
    negative_prompt="no props, no reflections, no clutter",
    style_guidance="Clean minimalist studio product photography",
)


# ── input_processing ──────────────────────────────────────────────────────────

_RAW_INPUT_PROCESSING = json.dumps({
    "intent": {"goal": "test goal", "marketplace": "amazon", "style_hints": [], "audience": "shoppers"},
    "image_quality": {"resolution": "200x200", "has_white_background": False, "is_blurry": False, "dominant_issues": []},
    "requires_normalization": True,
    "normalization_notes": "resize needed",
})


@pytest.mark.asyncio
async def test_input_processing_returns_parsed_output():
    from pixii_api.agents import input_processing
    img = _make_pil_image()

    with patch("pixii_api.agents.input_processing.nvidia_client.chat", new=AsyncMock(return_value=_RAW_INPUT_PROCESSING)):
        result = await input_processing.run(img, "test goal", "amazon", ["clean"])

    assert result.intent.goal == "test goal"
    assert result.intent.marketplace == "amazon"
    assert result.requires_normalization is True


@pytest.mark.asyncio
async def test_input_processing_sends_image_in_message():
    from pixii_api.agents import input_processing
    img = _make_pil_image()

    with patch("pixii_api.agents.input_processing.nvidia_client.chat", new=AsyncMock(return_value=_RAW_INPUT_PROCESSING)) as mock:
        await input_processing.run(img, "goal", "amazon", [])

    messages = mock.call_args[0][0]
    user_content = messages[1]["content"]
    assert isinstance(user_content, list)
    types = [c["type"] for c in user_content]
    assert "image_url" in types
    assert "text" in types


@pytest.mark.asyncio
async def test_input_processing_includes_goal_in_text():
    from pixii_api.agents import input_processing
    img = _make_pil_image()

    with patch("pixii_api.agents.input_processing.nvidia_client.chat", new=AsyncMock(return_value=_RAW_INPUT_PROCESSING)) as mock:
        await input_processing.run(img, "my custom goal", "shopify", ["bold"])

    messages = mock.call_args[0][0]
    user_content = messages[1]["content"]
    text_block = next(c for c in user_content if c["type"] == "text")
    assert "my custom goal" in text_block["text"]
    assert "shopify" in text_block["text"]


# ── product_understanding ─────────────────────────────────────────────────────

_RAW_PRODUCT_UNDERSTANDING = json.dumps({
    "product": {
        "category": "Electronics",
        "subcategory": "Audio",
        "materials": ["plastic"],
        "colors": ["black"],
        "brand_text": [],
        "distinctive_features": ["round shape"],
        "product_summary": "Black plastic wireless speaker",
    }
})

_FAKE_IMG = b"\xff\xd8\xff\xe0" + b"\x00" * 16


@pytest.mark.asyncio
async def test_product_understanding_returns_parsed_output():
    from pixii_api.agents import product_understanding

    with patch("pixii_api.agents.product_understanding.nvidia_client.chat", new=AsyncMock(return_value=_RAW_PRODUCT_UNDERSTANDING)):
        result = await product_understanding.run(_INPUT_PROCESSING_OUT, image_bytes=_FAKE_IMG)

    assert result.product.category == "Electronics"
    assert result.product.subcategory == "Audio"


@pytest.mark.asyncio
async def test_product_understanding_sends_image_in_message():
    from pixii_api.agents import product_understanding

    with patch("pixii_api.agents.product_understanding.nvidia_client.chat", new=AsyncMock(return_value=_RAW_PRODUCT_UNDERSTANDING)) as mock:
        await product_understanding.run(_INPUT_PROCESSING_OUT, image_bytes=_FAKE_IMG)

    messages = mock.call_args[0][0]
    user_content = messages[1]["content"]
    assert isinstance(user_content, list)
    types = [c["type"] for c in user_content]
    assert "image_url" in types


@pytest.mark.asyncio
async def test_product_understanding_falls_back_to_text_without_image():
    from pixii_api.agents import product_understanding

    with patch("pixii_api.agents.product_understanding.nvidia_client.chat", new=AsyncMock(return_value=_RAW_PRODUCT_UNDERSTANDING)) as mock:
        await product_understanding.run(_INPUT_PROCESSING_OUT)

    messages = mock.call_args[0][0]
    user_content = messages[1]["content"]
    assert isinstance(user_content, str)


# ── fidelity_guardrail ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fidelity_guardrail_calls_correct_template():
    from pixii_api.agents import fidelity_guardrail

    with patch("pixii_api.agents.fidelity_guardrail.run_agent", new=AsyncMock(return_value=_FIDELITY_OUT)) as mock:
        result = await fidelity_guardrail.run(_PRODUCT_OUT, _INTENT)

    assert result is _FIDELITY_OUT
    assert mock.call_args[0][0] == "fidelity_guardrail"


@pytest.mark.asyncio
async def test_fidelity_guardrail_passes_product_and_intent():
    from pixii_api.agents import fidelity_guardrail

    with patch("pixii_api.agents.fidelity_guardrail.run_agent", new=AsyncMock(return_value=_FIDELITY_OUT)) as mock:
        await fidelity_guardrail.run(_PRODUCT_OUT, _INTENT)

    context = mock.call_args[0][2]
    assert context["product"] is _PRODUCT_DESCRIPTOR
    assert context["intent"] is _INTENT
    assert context["prior_fidelity_rules"] == []


@pytest.mark.asyncio
async def test_fidelity_guardrail_passes_prior_rules():
    from pixii_api.agents import fidelity_guardrail
    prior = [SessionFidelityRule(attribute="label", importance=5, rationale="brand")]

    with patch("pixii_api.agents.fidelity_guardrail.run_agent", new=AsyncMock(return_value=_FIDELITY_OUT)) as mock:
        await fidelity_guardrail.run(_PRODUCT_OUT, _INTENT, prior_fidelity_rules=prior)

    context = mock.call_args[0][2]
    assert context["prior_fidelity_rules"] == prior


# ── constraint_modeling ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_constraint_modeling_calls_correct_template():
    from pixii_api.agents import constraint_modeling

    with patch("pixii_api.agents.constraint_modeling.run_agent", new=AsyncMock(return_value=_CONSTRAINTS_OUT)) as mock:
        result = await constraint_modeling.run(_PRODUCT_OUT, _INTENT, [], [])

    assert result is _CONSTRAINTS_OUT
    assert mock.call_args[0][0] == "constraint_modeling"


@pytest.mark.asyncio
async def test_constraint_modeling_passes_intent_items():
    from pixii_api.agents import constraint_modeling
    pos = [IntentItem(text="white bg", weight=1.0, source="user")]
    neg = [IntentItem(text="no reflections", weight=1.0, source="user")]

    with patch("pixii_api.agents.constraint_modeling.run_agent", new=AsyncMock(return_value=_CONSTRAINTS_OUT)) as mock:
        await constraint_modeling.run(_PRODUCT_OUT, _INTENT, pos, neg)

    context = mock.call_args[0][2]
    assert context["positive_intent"] == pos
    assert context["negative_intent"] == neg
    assert context["product"] is _PRODUCT_DESCRIPTOR


# ── workflow_planner ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_workflow_planner_calls_correct_template():
    from pixii_api.agents import workflow_planner

    with patch("pixii_api.agents.workflow_planner.run_agent", new=AsyncMock(return_value=_WORKFLOW_OUT)) as mock:
        result = await workflow_planner.run(_PRODUCT_OUT, _CONSTRAINTS_OUT, _FIDELITY_OUT, n_candidates=2)

    assert result is _WORKFLOW_OUT
    assert mock.call_args[0][0] == "workflow_planner"


@pytest.mark.asyncio
async def test_workflow_planner_passes_n_candidates_and_strategy():
    from pixii_api.agents import workflow_planner

    with patch("pixii_api.agents.workflow_planner.run_agent", new=AsyncMock(return_value=_WORKFLOW_OUT)) as mock:
        await workflow_planner.run(_PRODUCT_OUT, _CONSTRAINTS_OUT, _FIDELITY_OUT, n_candidates=3, strategy="edit")

    context = mock.call_args[0][2]
    assert context["n_candidates"] == 3
    assert context["strategy"] == "edit"
    assert context["prior_failures"] == []


@pytest.mark.asyncio
async def test_workflow_planner_passes_prior_failures():
    from pixii_api.agents import workflow_planner
    failures = ["background not white", "blur detected"]

    with patch("pixii_api.agents.workflow_planner.run_agent", new=AsyncMock(return_value=_WORKFLOW_OUT)) as mock:
        await workflow_planner.run(_PRODUCT_OUT, _CONSTRAINTS_OUT, _FIDELITY_OUT, n_candidates=1, prior_failures=failures)

    context = mock.call_args[0][2]
    assert context["prior_failures"] == failures


# ── prompt_composition ────────────────────────────────────────────────────────

_FAKE_IMG = b"\xff\xd8\xff\xe0" + b"\x00" * 16  # minimal JPEG header

@pytest.mark.asyncio
async def test_prompt_composition_returns_parsed_output():
    import json
    from pixii_api.agents import prompt_composition

    raw_json = json.dumps({
        "image_prompt": "Black plastic speaker, white background, soft lighting",
        "negative_prompt": "no props, no reflections",
        "style_guidance": "Clean minimalist studio",
    })

    with patch("pixii_api.agents.prompt_composition.nvidia_client.chat", new=AsyncMock(return_value=raw_json)):
        result = await prompt_composition.run(
            _PLAN, _PRODUCT_OUT, _CONSTRAINTS_OUT, _FIDELITY_OUT,
            image_bytes=_FAKE_IMG,
        )

    assert result.image_prompt == "Black plastic speaker, white background, soft lighting"
    assert result.negative_prompt == "no props, no reflections"


@pytest.mark.asyncio
async def test_prompt_composition_includes_image_in_messages():
    import json
    from pixii_api.agents import prompt_composition

    raw_json = json.dumps({
        "image_prompt": "test prompt",
        "negative_prompt": "no clutter",
        "style_guidance": "clean",
    })

    with patch("pixii_api.agents.prompt_composition.nvidia_client.chat", new=AsyncMock(return_value=raw_json)) as mock:
        await prompt_composition.run(
            _PLAN, _PRODUCT_OUT, _CONSTRAINTS_OUT, _FIDELITY_OUT,
            image_bytes=_FAKE_IMG,
        )

    messages = mock.call_args[0][0]
    user_content = messages[1]["content"]
    assert isinstance(user_content, list)
    types = [c["type"] for c in user_content]
    assert "image_url" in types
    assert "text" in types


@pytest.mark.asyncio
async def test_prompt_composition_includes_prompt_deltas():
    import json
    from pixii_api.agents import prompt_composition

    deltas = PromptDelta(
        add_to_prompt=["add warm tone"],
        remove_from_prompt=[],
        strengthen_negative=["no shadows"],
    )
    raw_json = json.dumps({
        "image_prompt": "test prompt",
        "negative_prompt": "no clutter",
        "style_guidance": "clean",
    })

    with patch("pixii_api.agents.prompt_composition.nvidia_client.chat", new=AsyncMock(return_value=raw_json)) as mock:
        await prompt_composition.run(
            _PLAN, _PRODUCT_OUT, _CONSTRAINTS_OUT, _FIDELITY_OUT,
            image_bytes=_FAKE_IMG, prompt_deltas=deltas,
        )

    messages = mock.call_args[0][0]
    text_block = next(c for c in messages[1]["content"] if c["type"] == "text")
    assert "add warm tone" in text_block["text"]
