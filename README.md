# Pixii Photo Upgrader

Transform supplier product images into studio-quality ecommerce photography using a multi-agent AI pipeline.

## Architecture

- **Backend**: FastAPI (Python 3.14, uv) — stateless, synchronous pipeline
- **Frontend**: Next.js App Router (TypeScript, Tailwind)
- **Image generation**: Gemini Developer API
- **Agent reasoning**: NVIDIA API (`moonshotai/kimi-k2.6`)
- **Deployment**: Render (backend) + Vercel (frontend)

## Pipeline

```
POST /enhance
  → input_processing      (NVIDIA) — intent extraction, image quality
  → product_understanding (NVIDIA) — product descriptor
  → fidelity_guardrail    (NVIDIA) — must-preserve rules
  → constraint_modeling   (NVIDIA) — composition/lighting/background
  → workflow_planner      (NVIDIA) — N candidate plans
  → per candidate:
      prompt_composition  (NVIDIA) — Gemini prompt
      gemini_client               — image generation
      output_review       (NVIDIA) — score + pass/fail
      failure_analysis    (NVIDIA) — diagnose + retry deltas
  → export_planner        (NVIDIA) — marketplace export variants
  ← EnhanceResponse with candidates (base64) + updated session state
```

Feedback loop: `POST /feedback` interprets user message → merges state deltas → reruns pipeline.

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env    # fill in NVIDIA_API_KEY and GEMINI_API_KEY
uv sync
uv run uvicorn pixii_api.main:app --reload --timeout-keep-alive 300
```

### Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/enhance

## Environment Variables

### Backend (`backend/.env`)
```
NVIDIA_API_KEY=nvapi-...
GEMINI_API_KEY=...
GEMINI_IMAGE_MODEL=gemini-2.0-flash-preview-image-generation
ALLOWED_ORIGINS=http://localhost:3000
MAX_RETRY_BUDGET=3
N_CANDIDATES=3
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Deployment

- **Backend → Render**: connect repo, set root dir `backend`, use `infra/render.yaml` blueprint, add API keys in dashboard.
- **Frontend → Vercel**: connect repo, set root dir `frontend` (or use `infra/vercel.json`), add `NEXT_PUBLIC_API_BASE_URL` pointing to Render service URL.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| POST | `/enhance` | Multipart: image + intent → candidates (long-poll, up to 300s) |
| POST | `/feedback` | JSON: prior state + message → rerun with feedback |
