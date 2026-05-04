from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import FidelityGuardrailOut, ProductUnderstandingOut, StructuredIntent
from pixii_api.schemas.session_state import FidelityRule


async def run(
    product: ProductUnderstandingOut,
    intent: StructuredIntent,
    prior_fidelity_rules: list[FidelityRule] | None = None,
) -> FidelityGuardrailOut:
    return await run_agent(
        "fidelity_guardrail",
        FidelityGuardrailOut,
        {
            "product": product.product,
            "intent": intent,
            "prior_fidelity_rules": prior_fidelity_rules or [],
        },
    )
