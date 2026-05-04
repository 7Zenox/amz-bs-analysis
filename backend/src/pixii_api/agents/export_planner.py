from pixii_api.agents.base import run_agent
from pixii_api.schemas.agent_io import ExportPlannerOut


async def run(
    marketplace: str,
    n_candidates: int,
    product_category: str,
) -> ExportPlannerOut:
    return await run_agent(
        "export_planner",
        ExportPlannerOut,
        {
            "marketplace": marketplace,
            "n_candidates": n_candidates,
            "product_category": product_category,
        },
    )
