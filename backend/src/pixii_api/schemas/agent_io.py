from typing import Literal
from pydantic import BaseModel, Field


# --- Input Processing ---

class ImageQualityReport(BaseModel):
    resolution: str
    has_white_background: bool
    is_blurry: bool
    dominant_issues: list[str]


class StructuredIntent(BaseModel):
    goal: str
    marketplace: str
    style_hints: list[str]
    audience: str


class InputProcessingOut(BaseModel):
    intent: StructuredIntent
    image_quality: ImageQualityReport
    requires_normalization: bool
    normalization_notes: str = ""


# --- Product Understanding ---

class ProductDescriptor(BaseModel):
    category: str
    subcategory: str
    materials: list[str]
    colors: list[str]
    brand_text: list[str]
    distinctive_features: list[str]
    product_summary: str


class ProductUnderstandingOut(BaseModel):
    product: ProductDescriptor


# --- Fidelity Guardrail ---

class FidelityRule(BaseModel):
    attribute: str = Field(max_length=80)
    importance: int = Field(ge=1, le=5)
    rationale: str = Field(max_length=120)


class FidelityGuardrailOut(BaseModel):
    must_preserve: list[FidelityRule] = Field(max_length=8)
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default=[], max_length=3)


# --- Constraint Modeling ---

class CompositionSpec(BaseModel):
    angle: str
    framing: str
    negative_space: str


class LightingSpec(BaseModel):
    style: str
    key_light: str
    fill_light: str
    shadow_type: str


class BackgroundSpec(BaseModel):
    style: str
    color: str
    texture: str


class MarketplaceRule(BaseModel):
    rule: str
    rationale: str


class ConstraintModelingOut(BaseModel):
    composition: CompositionSpec
    lighting: LightingSpec
    background: BackgroundSpec
    marketplace_rules: list[MarketplaceRule]


# --- Workflow Planner ---

class CandidatePlan(BaseModel):
    index: int
    mode: Literal["generate", "edit"]
    description: str
    angle_variation: str
    lighting_variation: str
    seed_hint: str


class WorkflowPlannerOut(BaseModel):
    plans: list[CandidatePlan]
    strategy_rationale: str


# --- Prompt Composition ---

class PromptCompositionOut(BaseModel):
    image_prompt: str
    negative_prompt: str
    style_guidance: str


# --- Output Review ---

class CandidateScores(BaseModel):
    fidelity: float = Field(ge=0.0, le=1.0)
    aesthetic: float = Field(ge=0.0, le=1.0)
    constraint_compliance: float = Field(ge=0.0, le=1.0)
    overall: float = Field(ge=0.0, le=1.0)


class OutputReviewOut(BaseModel):
    scores: CandidateScores
    passed: bool
    issues: list[str]
    pass_rationale: str


# --- Failure Analysis ---

class PromptDelta(BaseModel):
    add_to_prompt: list[str]
    remove_from_prompt: list[str]
    strengthen_negative: list[str]


class FailureAnalysisOut(BaseModel):
    root_causes: list[str]
    prompt_deltas: PromptDelta
    switch_mode: bool
    new_mode: Literal["generate", "edit"] | None = None


# --- Feedback Interpretation ---

class StateDelta(BaseModel):
    add_positive: list[str] = []
    add_negative: list[str] = []
    update_fidelity: list[str] = []
    update_strategy: str | None = None


class FeedbackInterpretationOut(BaseModel):
    deltas: StateDelta
    interpretation_summary: str


# --- Export Planner ---

class ExportVariant(BaseModel):
    name: str
    width: int
    height: int
    format: Literal["jpeg", "png", "webp"]
    background: str
    crop_notes: str


class ExportPlannerOut(BaseModel):
    variants: list[ExportVariant]
    primary_variant: str
