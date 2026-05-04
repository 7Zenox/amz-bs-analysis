from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import (
    ConstraintModelingOut,
    FidelityGuardrailOut,
    ProductUnderstandingOut,
    WorkflowPlannerOut,
)


async def run(
    product: ProductUnderstandingOut,
    constraints: ConstraintModelingOut,
    fidelity: FidelityGuardrailOut,
    n_candidates: int,
    strategy: str = "generate",
    prior_failures: list[str] | None = None,
) -> WorkflowPlannerOut:
    return await run_agent(
        "workflow_planner",
        WorkflowPlannerOut,
        {
            "product": product.product,
            "constraints": constraints,
            "fidelity_rules": fidelity.must_preserve,
            "n_candidates": n_candidates,
            "strategy": strategy,
            "prior_failures": prior_failures or [],
        },
    )
