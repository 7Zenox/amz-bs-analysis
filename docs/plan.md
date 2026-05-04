# Pixii Photo Upgrader — Implementation Plan

This document describes how to implement the **Photo Upgrader** system for Pixii: upload or ingest a poor supplier image, orchestrate agent-driven analysis and constraint-building, generate improved studio-quality outputs with the Gemini Developer API, and support iterative feedback with structured positive and negative intent.

The technical stack in this plan is:

- **Backend:** Python 3.14, `uv`, FastAPI, Pydantic v2, SQLAlchemy 2.x, PostgreSQL, Redis, Google Gen AI Python SDK.
- **Frontend:** latest Next.js with App Router, TypeScript, React Server Components by default, Client Components for interactive canvas and job polling.
- **AI API:** Gemini Developer API via the Google Gen AI SDK, using multimodal `generate_content` / chat-style image editing flows and, where needed, image-generation endpoints documented by Google.

FastAPI recommends using the `lifespan` mechanism for startup and shutdown resource management rather than older event hooks.[cite:65] FastAPI’s own docs show `FastAPI(lifespan=lifespan)` as the preferred pattern for application-scoped initialization.[cite:65] Uvicorn also documents the ASGI lifespan protocol as the mechanism for long-lived resources such as database pools and model clients.[cite:74]

The Google Gen AI SDK documents multimodal image generation and editing patterns for Gemini, including `generate_content` with `response_modalities=["IMAGE"]` and image parts passed as bytes, which is the right mental model for a stateful prompt orchestration layer.[cite:72] Google’s Gemini image-generation docs also document multi-turn image generation and editing workflows, which is why this plan stores canonical session state outside the model and rehydrates prompts on each turn.[cite:40]

Next.js App Router remains the right frontend architecture because Server Actions are stable and enabled by default in modern Next.js, though request size limits and origin restrictions must be considered carefully for image-heavy flows.[cite:73] Since image uploads are large and latency-sensitive, this plan uses direct uploads and backend API routes for media rather than relying on Server Actions for binary-heavy operations.[cite:73]

## 1. Product and architecture goals

The system should solve one job well: transform low-quality supplier photography into realistic, commerce-ready studio outputs while preserving product truth. Pixii’s public positioning emphasizes editable designs, Amazon-first creative workflows, and localized edits such as Spot Edit, so implementation should prefer controllable pipelines over “one magical prompt.”[cite:1]

The project must satisfy these non-negotiable goals:

- Preserve product identity: silhouette, label zone, logo placement, cap or closure shape, material cues, pack count, variant color.
- Learn both **what the user wants** and **what the user does not want** across turns.
- Retry intelligently when the model drifts or artifacts appear.
- Keep a full audit trail of prompts, exclusions, scores, and chosen path.
- Leave room for later Pixii integration into editable canvases and broader listing generation workflows.[cite:1][cite:23]

## 2. Core technical decisions

### 2.1 Why stateful orchestration matters

Gemini’s image workflows are strongest when treated as iterative multimodal conversations instead of stateless one-shot prompt calls.[cite:40][cite:72] For that reason, the backend should maintain a canonical session state object and rebuild generation instructions each turn from structured state rather than appending raw chat text.

This state object should include:

- `positive_intent`: desired additions or visual goals.
- `negative_intent`: exclusions and things to avoid.
- `locked_truths`: product facts that must not change.
- `observed_risks`: pre-generation risks found in the input.
- `observed_failures`: post-generation failures found in output review.
- `strategy`: current workflow choice such as restore, restage, or rebuild.

### 2.2 Recommended service decomposition

Use a modular monolith first. FastAPI can host a cleanly layered codebase with worker processes and async I/O while remaining easy to evolve.[cite:69] A distributed microservice design would be premature until generation volume, queue contention, and independent deployment needs are proven.

Recommended first deployment shape:

- `api`: FastAPI app for auth, sessions, uploads, jobs, feedback, export metadata.
- `worker`: asynchronous background runner for agent orchestration and Gemini calls.
- `db`: PostgreSQL for durable state.
- `cache`: Redis for queues, locks, and ephemeral job status.
- `web`: Next.js frontend.
- `storage`: S3-compatible object store for original inputs, generated images, masks, and exports.

## 3. Repository layout

Use a monorepo with explicit backend and frontend workspaces.

```text
pixii-photo-upgrader/
├── README.md
├── docs/
│   ├── architecture/
│   │   ├── agents.md
│   │   ├── prompts.md
│   │   └── api-contracts.md
│   └── decisions/
│       ├── 0001-stateful-orchestration.md
│       └── 0002-gemini-adapter.md
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── .python-version
│   ├── alembic.ini
│   ├── src/
│   │   └── app/
│   │       ├── main.py
│   │       ├── config.py
│   │       ├── lifespan.py
│   │       ├── api/
│   │       │   ├── routes/
│   │       │   │   ├── health.py
│   │       │   │   ├── auth.py
│   │       │   │   ├── uploads.py
│   │       │   │   ├── sessions.py
│   │       │   │   ├── jobs.py
│   │       │   │   ├── feedback.py
│   │       │   │   └── exports.py
│   │       ├── db/
│   │       │   ├── models/
│   │       │   ├── session.py
│   │       │   └── migrations/
│   │       ├── schemas/
│   │       ├── services/
│   │       │   ├── storage.py
│   │       │   ├── gemini_adapter.py
│   │       │   ├── prompt_builder.py
│   │       │   ├── scoring.py
│   │       │   └── masking.py
│   │       ├── agents/
│   │       │   ├── orchestrator.py
│   │       │   ├── input_processing.py
│   │       │   ├── product_understanding.py
│   │       │   ├── fidelity_guardrail.py
│   │       │   ├── constraint_modeling.py
│   │       │   ├── workflow_planner.py
│   │       │   ├── output_review.py
│   │       │   ├── failure_analysis.py
│   │       │   ├── feedback_interpreter.py
│   │       │   └── export_planner.py
│   │       ├── workers/
│   │       │   ├── queue.py
│   │       │   └── runner.py
│   │       └── utils/
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── dashboard/
│   │   ├── sessions/[id]/
│   │   ├── api/
│   │   └── globals.css
│   ├── components/
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   └── tests/
└── infra/
    ├── docker/
    ├── compose.yml
    └── deploy/
```

## 4. Backend setup with Python 3.13 and uv

`uv` is a strong fit because it provides fast dependency resolution and reproducible environments with a lockfile, which is useful for a backend that will likely mix web, imaging, and SDK dependencies. The backend should explicitly target Python 3.13 in `pyproject.toml` and `.python-version` to prevent drift across machines.

### 4.1 Backend bootstrap

```bash
mkdir -p pixii-photo-upgrader/backend
cd pixii-photo-upgrader/backend
uv init --python 3.13
uv add fastapi uvicorn[standard] pydantic-settings sqlalchemy asyncpg alembic redis
uv add google-genai pillow python-multipart httpx orjson
uv add structlog tenacity boto3 opentelemetry-sdk opentelemetry-instrumentation-fastapi
uv add --dev pytest pytest-asyncio ruff mypy httpx pytest-cov
python -V
uv lock
```

### 4.2 Suggested `pyproject.toml`

```toml
[project]
name = "pixii-photo-upgrader-backend"
version = "0.1.0"
description = "Agentic backend for Pixii Photo Upgrader"
requires-python = ">=3.13,<3.14"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.34.0",
  "pydantic-settings>=2.7.0",
  "sqlalchemy>=2.0.36",
  "asyncpg>=0.30.0",
  "alembic>=1.14.0",
  "redis>=5.2.0",
  "google-genai>=1.0.0",
  "pillow>=11.0.0",
  "python-multipart>=0.0.20",
  "httpx>=0.28.0",
  "orjson>=3.10.0",
  "structlog>=24.4.0",
  "tenacity>=9.0.0",
  "boto3>=1.35.0",
  "opentelemetry-sdk>=1.28.0",
  "opentelemetry-instrumentation-fastapi>=0.49b0"
]

[tool.ruff]
line-length = 100
target-version = "py313"

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

## 5. FastAPI application design

FastAPI should use `lifespan` for initializing shared resources like the database engine, Redis connection, Gemini client wrapper, and worker queue handles.[cite:65][cite:74] Do not scatter singleton initialization across modules.

### 5.1 App bootstrap

```python
# backend/src/app/main.py
from fastapi import FastAPI
from app.lifespan import lifespan
from app.api.routes import health, uploads, sessions, jobs, feedback, exports

app = FastAPI(title="Pixii Photo Upgrader API", lifespan=lifespan)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
app.include_router(exports.router, prefix="/exports", tags=["exports"])
```

### 5.2 Lifespan setup

```python
# backend/src/app/lifespan.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from redis.asyncio import Redis
from google import genai
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    redis = Redis.from_url(settings.redis_url, decode_responses=False)
    gemini_client = genai.Client(api_key=settings.google_api_key)

    app.state.db_engine = engine
    app.state.db_session_factory = session_factory
    app.state.redis = redis
    app.state.gemini_client = gemini_client

    yield

    await redis.close()
    await engine.dispose()
```

### 5.3 Config

```python
# backend/src/app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str
    redis_url: str
    google_api_key: str
    s3_bucket: str
    s3_region: str = "us-east-1"
    s3_endpoint_url: str | None = None
    s3_access_key_id: str
    s3_secret_access_key: str
    max_retry_budget: int = 3
    max_upload_mb: int = 25

settings = Settings()
```

## 6. Data model and canonical state

The most important schema in the system is the **session state**. It should be versioned, auditable, and independent from the prompt format, because prompt templates will change over time.

### 6.1 Primary entities

- `users`
- `sessions`
- `session_assets`
- `jobs`
- `job_attempts`
- `feedback_events`
- `exports`
- `prompt_snapshots`
- `review_scores`

### 6.2 Pydantic models

```python
# backend/src/app/schemas/session_state.py
from pydantic import BaseModel, Field

class LockedTruth(BaseModel):
    key: str
    value: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: str

class IntentItem(BaseModel):
    text: str
    weight: float = Field(default=1.0, ge=0.0, le=2.0)
    source: str

class RiskItem(BaseModel):
    type: str
    severity: float = Field(ge=0.0, le=1.0)
    details: str

class SessionState(BaseModel):
    strategy: str | None = None
    positive_intent: list[IntentItem] = []
    negative_intent: list[IntentItem] = []
    locked_truths: list[LockedTruth] = []
    observed_risks: list[RiskItem] = []
    observed_failures: list[RiskItem] = []
    revision: int = 1
```

### 6.3 Session table sketch

```sql
create table sessions (
  id uuid primary key,
  user_id uuid not null,
  title text,
  status text not null,
  state_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Use `jsonb` for the canonical state initially. If specific fields become query hotspots, promote them into columns later.

## 7. Agent architecture

The orchestration layer should be deterministic and testable. Agents should operate on typed inputs and outputs rather than unstructured dicts.

### 7.1 Agent contracts

All agents should follow a common shape:

```python
from typing import Protocol

class AgentResult[T](BaseModel):
    value: T
    events: list[str] = []
    warnings: list[str] = []

class Agent(Protocol):
    async def run(self, ctx: "AgentContext") -> AgentResult: ...
```

### 7.2 Agent responsibilities

#### Orchestrator Agent

Responsibilities:
- Load session state.
- Decide next stage.
- Call specialist agents.
- Persist outputs after each stage.
- Enforce retry budget.

#### Input Processing Agent

Responsibilities:
- Download supplier image if a URL was pasted.
- Validate MIME type and size.
- Normalize orientation, convert color mode, strip obvious whitespace.
- Run OCR and basic image heuristics.

#### Product Understanding Agent

Responsibilities:
- Infer product category and likely semantic attributes.
- Detect candidate label region and logo region.
- Produce confidence scores.

This can start with Gemini multimodal understanding or a hybrid approach with deterministic image tooling plus Gemini reasoning.[cite:40][cite:72]

#### Fidelity Guardrail Agent

Responsibilities:
- Refuse unsafe or unreliable full-auto generations.
- Determine if there is enough visible evidence to preserve product truth.
- Request more input when confidence is too low.

#### Constraint Modeling Agent

Responsibilities:
- Convert user text and agent findings into canonical state.
- Separate wants, exclusions, locked truths, and risks.

#### Workflow Planner Agent

Responsibilities:
- Choose among `restore`, `restage`, and `rebuild`.
- Select fallback path when repeated failures occur.

#### Prompt Composition Agent

Responsibilities:
- Compile the canonical state into Gemini-ready instructions.
- Preserve template versioning.
- Emit prompt snapshots for audit.

#### Output Review Agent

Responsibilities:
- Score output quality.
- Detect drift from product truth.
- Flag crop or label corruption.

#### Failure Analysis Agent

Responsibilities:
- Classify failures.
- Suggest how to update negative intent or locked truths.
- Trigger recovery path changes.

#### Feedback Interpretation Agent

Responsibilities:
- Parse user feedback into intent deltas.
- Distinguish positive, negative, and immutable requests.

#### Export Planner Agent

Responsibilities:
- Produce final variants.
- Attach audit metadata.
- Emit structured output descriptors for frontend and downstream systems.

## 8. Gemini integration design

The Google Gen AI SDK supports Gemini via `google.genai`, with examples for both `generate_content` and image generation modalities in Python.[cite:72] Gemini image-generation docs show conversational, iterative flows, which matches this project’s need to keep an evolving session state.[cite:40]

### 8.1 Recommended wrapper

Never call the SDK directly from route handlers. Use a single adapter service.

```python
# backend/src/app/services/gemini_adapter.py
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO

class GeminiAdapter:
    def __init__(self, client: genai.Client):
        self.client = client

    async def generate_image_edit(
        self,
        *,
        model: str,
        instruction: str,
        image_bytes: bytes,
        mime_type: str,
        aspect_ratio: str = "1:1",
    ) -> list[Image.Image]:
        response = self.client.models.generate_content(
            model=model,
            contents=[
                instruction,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
            ),
        )

        images: list[Image.Image] = []
        for part in response.parts:
            if getattr(part, "inline_data", None):
                images.append(part.as_image())
        return images
```

### 8.2 Prompt building strategy

Do not let users write raw prompts directly into the generation call. Instead, compile all inputs into a structured template.

```python
# backend/src/app/services/prompt_builder.py
from app.schemas.session_state import SessionState

PROMPT_TEMPLATE = """
You are generating a realistic ecommerce studio image from a reference product photo.

Goal:
{goal}

Positive instructions:
{positive}

Exclusions:
{negative}

Locked product truths:
{locked}

Quality bar:
- Preserve product identity.
- Keep proportions realistic.
- Keep label region and logo placement intact.
- Avoid adding props, extra packaging, scene clutter, or unrealistic reflections unless explicitly requested.
- Produce a commercially believable result suitable for ecommerce.
""".strip()


def build_generation_prompt(state: SessionState, goal: str) -> str:
    positive = "\n".join(f"- {x.text}" for x in state.positive_intent) or "- Keep the result clean and realistic"
    negative = "\n".join(f"- {x.text}" for x in state.negative_intent) or "- Do not introduce irrelevant objects"
    locked = "\n".join(f"- {x.key}: {x.value}" for x in state.locked_truths) or "- Preserve the core product appearance"
    return PROMPT_TEMPLATE.format(goal=goal, positive=positive, negative=negative, locked=locked)
```

### 8.3 Suggested prompt patterns

#### Initial generation prompt

```text
You are generating a realistic ecommerce studio image from a supplier reference photo.

Goal:
Create 4 realistic studio-shot variants suitable for a product detail page hero image.

Positive instructions:
- Clean white seamless background.
- Soft diffused studio lighting.
- Subtle natural shadow under the product.
- Premium but realistic finish.

Exclusions:
- Do not add props.
- Do not add people or hands.
- Do not crop any part of the product.
- Do not alter logo placement.
- Do not distort the product silhouette.
- Do not add dramatic reflections.

Locked product truths:
- Preserve bottle silhouette.
- Preserve cap shape.
- Preserve front label region.
- Preserve product colorway.

Quality bar:
- Preserve product identity.
- Keep proportions realistic.
- Keep label region and logo placement intact.
- Avoid adding props, extra packaging, scene clutter, or unrealistic reflections unless explicitly requested.
- Produce a commercially believable result suitable for ecommerce.
```

#### Local edit prompt

```text
Edit only the selected region.
Preserve all other parts of the image exactly as they are.

Task:
Replace the uneven shadow with a softer natural studio shadow.

Exclusions:
- Do not change the product body.
- Do not change the label.
- Do not change the crop.
- Do not change lighting outside the marked shadow area.
```

#### Recovery prompt after drift

```text
The previous result changed the product shape and introduced reflections that were not requested.
Retry with stricter fidelity.

Requirements:
- Preserve the exact silhouette and visible proportions from the reference image.
- Keep the label area unchanged.
- Use a simpler studio setup.
- Remove harsh reflections.
- No props, no extra packaging, no decorative surfaces.
```

## 9. Scoring and review design

This project should not accept raw Gemini output without review. The review pass is where the system becomes product-grade.

### 9.1 Score dimensions

- `fidelity_score`: similarity to source product identity.
- `label_integrity_score`: whether label region remains plausible and undamaged.
- `crop_safety_score`: no important product parts cut off.
- `background_cleanliness_score`: no junk artifacts.
- `commercial_realism_score`: plausible studio output.
- `overall_score`: weighted sum.

### 9.2 Example scoring model

```python
from pydantic import BaseModel

class ReviewScores(BaseModel):
    fidelity_score: float
    label_integrity_score: float
    crop_safety_score: float
    background_cleanliness_score: float
    commercial_realism_score: float

    @property
    def overall_score(self) -> float:
        return (
            self.fidelity_score * 0.35
            + self.label_integrity_score * 0.20
            + self.crop_safety_score * 0.15
            + self.background_cleanliness_score * 0.10
            + self.commercial_realism_score * 0.20
        )
```

### 9.3 Review pipeline

- Deterministic image checks first, for dimensions, blank outputs, and crop overflow.
- Vision reasoning pass next, with Gemini or a secondary evaluator prompt for fidelity checks.
- Threshold gate last, to decide accept, retry, or escalate.

## 10. Queue and job execution

Generation should run asynchronously. Synchronous generation inside request handlers will create poor UX and brittle timeouts.

### 10.1 Job states

- `queued`
- `running`
- `needs_input`
- `retrying`
- `succeeded`
- `failed`
- `manual_review`

### 10.2 Worker loop

```python
# backend/src/app/workers/runner.py
async def process_job(job_id: str) -> None:
    job = await load_job(job_id)
    ctx = await build_context(job)

    orchestrator = OrchestratorAgent()
    result = await orchestrator.run(ctx)

    await persist_result(job_id, result)
```

Use Redis for queueing initially. If throughput grows, move to a more specialized queue later.

## 11. API contract

### 11.1 Create session

```http
POST /sessions
Content-Type: application/json

{
  "source_type": "upload",
  "title": "Amber supplement bottle"
}
```

### 11.2 Upload asset

```http
POST /uploads/{session_id}
Content-Type: multipart/form-data
```

### 11.3 Start generation job

```http
POST /jobs
Content-Type: application/json

{
  "session_id": "uuid",
  "goal": "Generate clean studio hero variants for Amazon PDP",
  "desired_output": "studio_hero"
}
```

### 11.4 Submit feedback

```http
POST /feedback
Content-Type: application/json

{
  "session_id": "uuid",
  "candidate_id": "uuid",
  "message": "Keep the bottle exactly the same, but make the background pure white and remove harsh reflections. No props."
}
```

### 11.5 Fetch status

```http
GET /jobs/{job_id}
```

### 11.6 Fetch session state

```http
GET /sessions/{session_id}
```

## 12. Frontend architecture with Next.js

Next.js App Router is the right choice for modern React architecture, and Server Actions are stable, but large binary uploads should avoid Server Actions due to body size constraints and operational complexity.[cite:73] The frontend should use App Router for page composition and route handlers where helpful, but image upload and polling should talk directly to the FastAPI backend.

### 12.1 Frontend pages

- `/` marketing and entry.
- `/dashboard` sessions list.
- `/sessions/[id]` main workspace.
- `/sessions/[id]/review` candidate review state.
- `/sessions/[id]/edit` local spot edit workspace.

### 12.2 Component map

- `UploadDropzone`
- `SessionSidebar`
- `IntentPanel`
- `CandidateGrid`
- `FeedbackComposer`
- `JobStatusPanel`
- `SpotEditCanvas`
- `ExportDrawer`

### 12.3 Frontend bootstrap

```bash
cd ../
npx create-next-app@latest frontend --ts --eslint --app --src-dir --import-alias "@/*"
cd frontend
npm install zod react-hook-form @tanstack/react-query zustand
```

### 12.4 Next.js data strategy

- Use Server Components for session page shell and initial metadata fetch.
- Use Client Components for upload, candidate review, feedback submission, and polling.
- Use React Query for job polling and optimistic feedback state.

### 12.5 Example upload component

```tsx
'use client'

import { useState } from 'react'

export function UploadForm({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false)

  async function onSubmit(file: File) {
    setLoading(true)
    const body = new FormData()
    body.append('file', file)

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/uploads/${sessionId}`, {
      method: 'POST',
      body,
    })

    if (!res.ok) throw new Error('Upload failed')
    setLoading(false)
  }

  return (
    <label>
      <input
        type="file"
        accept="image/*"
        disabled={loading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onSubmit(file)
        }}
      />
    </label>
  )
}
```

## 13. Intent capture UX requirements

This is a product-critical area. The frontend should explicitly separate:

- What to improve.
- What to avoid.
- What must stay exactly the same.

Do not only provide a single freeform prompt box. A single box is easy to ship but weak for control and analytics.

Recommended UI sections:

- **Desired result** chips or textarea.
- **Do not do this** chips or textarea.
- **Must preserve** chips or protected toggles.
- **Advanced** section for crop, background, and aspect ratio.

These fields should all map into the backend canonical state.

## 14. Persistence and storage

### 14.1 Object storage key scheme

```text
sessions/{session_id}/inputs/original.png
sessions/{session_id}/derived/normalized.png
sessions/{session_id}/attempts/{attempt_id}/candidate-1.png
sessions/{session_id}/attempts/{attempt_id}/candidate-2.png
sessions/{session_id}/exports/final-main-image.png
sessions/{session_id}/exports/final-soft-shadow.png
```

### 14.2 Metadata to persist per artifact

- MIME type
- width/height
- sha256
- source role: input, normalized, candidate, export
- attempt id
- review scores
- selected flag

## 15. Observability

This is essential because prompt behavior will drift over time and failures will be subtle.

### 15.1 Log every generation attempt

Persist:
- prompt template version
- compiled instruction text
- model name
- generation config
- input asset ids
- output artifact ids
- review scores
- failure classification

### 15.2 Structured logging

Use `structlog` and include:
- `session_id`
- `job_id`
- `attempt_id`
- `agent_name`
- `strategy`
- `model`

### 15.3 Tracing

Instrument FastAPI and worker boundaries. Long-term, add spans around each agent and Gemini API call.

## 16. Security and compliance

- Never expose the Google API key to the frontend.
- Validate MIME types and file sizes before storage.
- Scan uploaded files for obvious misuse.
- Rate-limit session creation, upload, and generation endpoints.
- Treat supplier URLs as untrusted input; only fetch via backend.
- Store prompt and artifact audit data securely because product imagery may be commercially sensitive.

## 17. Testing strategy

### 17.1 Test layers

- Unit tests for prompt building, state merging, and failure classification.
- Integration tests for session lifecycle and API contracts.
- Golden tests for prompt snapshots.
- Smoke tests for Gemini adapter behind a feature flag.
- Frontend component tests for feedback parsing and upload flows.

### 17.2 Example prompt snapshot test

```python
def test_build_generation_prompt_includes_negative_intent():
    state = SessionState(
        positive_intent=[IntentItem(text="soft studio lighting", source="user")],
        negative_intent=[IntentItem(text="do not add props", source="user")],
        locked_truths=[LockedTruth(key="shape", value="preserve bottle silhouette", source="agent", confidence=0.9)],
    )

    prompt = build_generation_prompt(state, goal="Generate a hero image")

    assert "soft studio lighting" in prompt
    assert "do not add props" in prompt
    assert "preserve bottle silhouette" in prompt
```

### 17.3 FastAPI lifespan tests

FastAPI documents testing lifespan with `TestClient` in a context manager, which should be used for startup resource tests.[cite:68]

```python
from fastapi.testclient import TestClient
from app.main import app


def test_healthcheck():
    with TestClient(app) as client:
        r = client.get('/health')
        assert r.status_code == 200
```

## 18. Local development workflow

### 18.1 Docker Compose services

- `postgres`
- `redis`
- `minio` or another S3-compatible storage
- `backend`
- `worker`
- `frontend`

### 18.2 Commands

```bash
# backend
cd backend
uv sync
uv run alembic upgrade head
uv run fastapi dev src/app/main.py

# worker
uv run python -m app.workers.runner

# frontend
cd ../frontend
npm install
npm run dev
```

FastAPI’s CLI docs note that `fastapi dev` auto-detects the app and runs a development server with reload, which is convenient during the first implementation phase.[cite:69]

## 19. Suggested implementation phases

### Phase 0 — Scaffold

- Monorepo structure.
- FastAPI app, lifespan, health endpoint.
- Next.js app shell.
- PostgreSQL, Redis, MinIO in local compose.
- Session create/upload/status APIs.

### Phase 1 — Single-turn MVP

- Upload one image.
- Normalize input.
- Build basic state object.
- Generate 3 to 4 candidates with Gemini.
- Store outputs.
- Show candidates in Next.js.

### Phase 2 — Agentic review loop

- Product understanding agent.
- Fidelity guardrail.
- Output review and retry budget.
- Failure classification and strategy switching.

### Phase 3 — Feedback memory

- Positive intent parsing.
- Negative intent parsing.
- Locked truths parsing.
- State merge and rerender loop.

### Phase 4 — Spot edit and export

- Region selection.
- Local edit flow.
- Export variants and metadata.
- Audit log view.

### Phase 5 — Hardening

- Rate limits.
- tracing/logging.
- better heuristics.
- benchmark suite with known supplier-image failures.

## 20. Example `.env`

```dotenv
APP_ENV=development
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/pixii
REDIS_URL=redis://localhost:6379/0
GOOGLE_API_KEY=your_google_api_key
S3_BUCKET=pixii-local
S3_REGION=us-east-1
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
MAX_RETRY_BUDGET=3
MAX_UPLOAD_MB=25
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## 21. Documentation links

Use these as primary references during implementation:

- FastAPI lifespan and startup/shutdown: <https://fastapi.tiangolo.com/advanced/events/> [cite:65]
- FastAPI lifespan testing: <https://fastapi.tiangolo.com/advanced/testing-events/> [cite:68]
- FastAPI overview and CLI: <https://fastapi.tiangolo.com> [cite:69]
- Uvicorn lifespan concepts: <https://uvicorn.dev/concepts/lifespan/> [cite:74]
- Gemini image generation docs: <https://ai.google.dev/gemini-api/docs/image-generation> [cite:40]
- Google Gen AI Python SDK docs: <https://googleapis.github.io/python-genai/> [cite:72]
- Imagen via Gemini API docs, for additional Python SDK examples: <https://ai.google.dev/gemini-api/docs/imagen> [cite:27]
- Next.js Server Actions config and limits: <https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions> [cite:73]
- Pixii product site for workflow and positioning context: <https://pixii.ai> [cite:1]

## 22. Final implementation notes

The most important engineering principle for this project is to treat prompt generation as a **compiled artifact** derived from structured state, not as raw chat text. Gemini should be the image-generation and multimodal reasoning engine, but the product’s reliability will come from the state model, agent decisions, review layer, and feedback memory wrapped around it.[cite:40][cite:72]

The most important product principle is to preserve truth before aesthetics. A slightly plain but faithful studio output is better than a visually impressive result that changes the product in a way that would damage ecommerce trust or compliance.[cite:1][cite:18]
