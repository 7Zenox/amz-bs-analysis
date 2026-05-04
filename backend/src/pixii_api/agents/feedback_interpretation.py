from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import FeedbackInterpretationOut
from pixii_api.schemas.session_state import SessionState


async def run(state: SessionState, message: str) -> FeedbackInterpretationOut:
    return await run_agent(
        "feedback_interpretation",
        FeedbackInterpretationOut,
        {"state": state, "message": message},
    )
