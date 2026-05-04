from pixii_api.schemas.agent_io import FeedbackInterpretationOut, FidelityGuardrailOut, ProductUnderstandingOut
from pixii_api.schemas.session_state import FidelityRule, IntentItem, SessionState


def apply_feedback(state: SessionState, feedback: FeedbackInterpretationOut) -> SessionState:
    deltas = feedback.deltas
    new_positive = list(state.positive_intent)
    new_negative = list(state.negative_intent)
    new_fidelity = list(state.fidelity_rules)

    for text in deltas.add_positive:
        if not any(i.text == text for i in new_positive):
            new_positive.append(IntentItem(text=text, source="feedback"))

    for text in deltas.add_negative:
        if not any(i.text == text for i in new_negative):
            new_negative.append(IntentItem(text=text, source="feedback"))

    for attr in deltas.update_fidelity:
        if not any(r.attribute == attr for r in new_fidelity):
            new_fidelity.append(FidelityRule(attribute=attr, importance=4, rationale="user-specified"))

    strategy = deltas.update_strategy or state.strategy

    return state.model_copy(update={
        "positive_intent": new_positive,
        "negative_intent": new_negative,
        "fidelity_rules": new_fidelity,
        "strategy": strategy,
        "revision": state.revision + 1,
    })


def update_from_agents(
    state: SessionState,
    product: ProductUnderstandingOut,
    fidelity: FidelityGuardrailOut,
) -> SessionState:
    new_fidelity = list(state.fidelity_rules)
    for rule in fidelity.must_preserve:
        if not any(r.attribute == rule.attribute for r in new_fidelity):
            new_fidelity.append(FidelityRule(
                attribute=rule.attribute,
                importance=rule.importance,
                rationale=rule.rationale,
            ))

    return state.model_copy(update={
        "product_description": product.product.product_summary,
        "fidelity_rules": new_fidelity,
    })
