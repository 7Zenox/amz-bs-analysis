FROM python:3.14-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src/ ./src/

CMD ["uv", "run", "uvicorn", "pixii_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "300"]
