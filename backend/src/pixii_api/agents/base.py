from typing import Any, TypeVar
from pydantic import BaseModel
from pixii_api.llm import nvidia_client
from pixii_api.llm import prompt_loader

T = TypeVar("T", bound=BaseModel)


async def run_agent(
    template_name: str,
    output_schema: type[T],
    context: dict[str, Any],
) -> T:
    prompt = prompt_loader.render(template_name, **context)
    messages = [{"role": "user", "content": prompt}]
    return await nvidia_client.chat_json(messages, output_schema)
