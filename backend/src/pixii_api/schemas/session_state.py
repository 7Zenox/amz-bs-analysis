from pydantic import BaseModel, Field


class IntentItem(BaseModel):
    text: str
    weight: float = Field(default=1.0, ge=0.0, le=2.0)
    source: str = "user"


class FidelityRule(BaseModel):
    attribute: str
    importance: int = Field(ge=1, le=5)
    rationale: str


class SessionState(BaseModel):
    positive_intent: list[IntentItem] = []
    negative_intent: list[IntentItem] = []
    fidelity_rules: list[FidelityRule] = []
    product_description: str = ""
    strategy: str = "generate"
    revision: int = 0
