from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import (
    CandidatePlan,
    ConstraintModelingOut,
    FidelityGuardrailOut,
    OutputReviewOut,
    PromptCompositionOut,
)


async def run(
    plan: CandidatePlan,
    composed: PromptCompositionOut,
    fidelity: FidelityGuardrailOut,
    constraints: ConstraintModelingOut,
    image_width: int,
    image_height: int,
    file_size_kb: int,
) -> OutputReviewOut:
    return await run_agent(
        "output_review",
        OutputReviewOut,
        {
            "plan": plan,
            "prompt_used": composed.image_prompt,
            "negative_prompt": composed.negative_prompt,
            "fidelity_rules": fidelity.must_preserve,
            "marketplace_rules": constraints.marketplace_rules,
            "width": image_width,
            "height": image_height,
            "file_size_kb": file_size_kb,
        },
    )
