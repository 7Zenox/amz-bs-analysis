from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_env = Environment(
    loader=FileSystemLoader(str(_PROMPTS_DIR)),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


def render(template_name: str, **kwargs: object) -> str:
    template = _env.get_template(f"{template_name}.j2")
    return template.render(**kwargs)
