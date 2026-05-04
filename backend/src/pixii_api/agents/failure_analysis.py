from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import (
    CandidatePlan,
    FailureAnalysisOut,
    OutputReviewOut,
    PromptCompositionOut,
)


async def run(
    review: OutputReviewOut,
    plan: CandidatePlan,
    composed: PromptCompositionOut,
) -> FailureAnalysisOut:
    return await run_agent(
        "failure_analysis",
        FailureAnalysisOut,
        {
            "issues": review.issues,
            "prompt_used": composed.image_prompt,
            "negative_prompt": composed.negative_prompt,
            "plan_description": plan.description,
            "plan_mode": plan.mode,
        },
    )
