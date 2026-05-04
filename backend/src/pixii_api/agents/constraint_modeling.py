from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import ConstraintModelingOut, ProductUnderstandingOut, StructuredIntent
from pixii_api.schemas.session_state import IntentItem


async def run(
    product: ProductUnderstandingOut,
    intent: StructuredIntent,
    positive_intent: list[IntentItem],
    negative_intent: list[IntentItem],
) -> ConstraintModelingOut:
    return await run_agent(
        "constraint_modeling",
        ConstraintModelingOut,
        {
            "product": product.product,
            "intent": intent,
            "positive_intent": positive_intent,
            "negative_intent": negative_intent,
        },
    )
