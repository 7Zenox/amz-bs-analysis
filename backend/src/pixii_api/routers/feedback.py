from fastapi import APIRouter, HTTPException

from pixii_api.agents import feedback_interpretation
from pixii_api.schemas.enhance import EnhanceResponse, FeedbackRequest
from pixii_api.services import image_utils, pipeline, state_store

router = APIRouter()


@router.post("/feedback", response_model=EnhanceResponse)
async def feedback(req: FeedbackRequest) -> EnhanceResponse:
    # Interpret the user's message into state deltas
    try:
        interpretation = await feedback_interpretation.run(req.prior_state, req.message)
    except Exception as exc:
        raise HTTPException(500, f"Feedback interpretation error: {exc}") from exc

    # Merge deltas into the prior state
    updated_state = state_store.apply_feedback(req.prior_state, interpretation)

    # Decode the reference image from the prior session
    try:
        image_bytes = image_utils.from_b64(req.image_b64)
    except Exception as exc:
        raise HTTPException(400, f"Invalid image_b64: {exc}") from exc

    # Rerun the pipeline with updated state
    try:
        result = await pipeline.run(
            image_bytes=image_bytes,
            image_mime=req.mime_type,
            goal=req.goal or updated_state.positive_intent[0].text if updated_state.positive_intent else "Improve this product image",
            marketplace=req.marketplace,
            style_hints=req.style_hints,
            state=updated_state,
            n_candidates=req.n_candidates,
        )
    except Exception as exc:
        raise HTTPException(500, f"Pipeline error: {exc}") from exc

    return result
