import structlog
from fastapi import APIRouter, Form, HTTPException, UploadFile

from pixii_api.config import settings
from pixii_api.schemas.enhance import EnhanceResponse
from pixii_api.schemas.session_state import SessionState
from pixii_api.services import pipeline

log = structlog.get_logger()
router = APIRouter()

_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
_MAX_BYTES = 25 * 1024 * 1024  # 25MB


@router.post("/enhance", response_model=EnhanceResponse)
async def enhance(
    file: UploadFile,
    goal: str = Form(default="Create a professional studio product image"),
    marketplace: str = Form(default="amazon"),
    style_hints: str = Form(default=""),
    n_candidates: int = Form(default=0),
    state_json: str = Form(default="{}"),
) -> EnhanceResponse:
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > _MAX_BYTES:
        raise HTTPException(413, "File too large (max 25MB)")

    hints = [h.strip() for h in style_hints.split(",") if h.strip()]
    n = n_candidates if n_candidates > 0 else settings.n_candidates

    try:
        state = SessionState.model_validate_json(state_json)
    except Exception:
        state = SessionState()

    try:
        result = await pipeline.run(
            image_bytes=image_bytes,
            image_mime=file.content_type or "image/jpeg",
            goal=goal,
            marketplace=marketplace,
            style_hints=hints,
            state=state,
            n_candidates=n,
        )
    except Exception as exc:
        import traceback
        log.error(
            "pipeline_error",
            error=str(exc),
            error_type=type(exc).__name__,
            traceback=traceback.format_exc(),
        )
        raise HTTPException(500, f"Pipeline error: {type(exc).__name__}: {exc}") from exc

    return result
