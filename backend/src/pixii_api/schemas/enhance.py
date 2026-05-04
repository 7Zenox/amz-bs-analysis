from pydantic import BaseModel
from pixii_api.schemas.session_state import SessionState
from pixii_api.schemas.agent_io import ExportVariant


class CandidateOut(BaseModel):
    index: int
    image_b64: str
    mime_type: str
    width: int
    height: int


class EnhanceResponse(BaseModel):
    candidates: list[CandidateOut]
    updated_state: SessionState
    export_variants: list[ExportVariant]
    duration_ms: int
    attempts: int


class FeedbackRequest(BaseModel):
    image_b64: str
    mime_type: str = "image/jpeg"
    prior_state: SessionState
    message: str
    goal: str = ""
    marketplace: str = "amazon"
    style_hints: list[str] = []
    n_candidates: int = 3
