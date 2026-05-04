---
name: Project - Pixii Photo Upgrader
description: Core architecture and stack decisions for the listing-image-enhancer project
type: project
---

Stateless agentic product photo enhancer. No DB, no storage — data flows through the pipeline and results return in the HTTP response.

**Stack**: Python 3.14 + uv, FastAPI, NVIDIA API (kimi-k2.6) for all agent reasoning, Gemini for image gen/edit, Next.js App Router + Tailwind.

**Structure**: `backend/` (Render) + `frontend/` (Vercel), `infra/` for render.yaml + vercel.json.

**Pipeline**: POST /enhance (multipart) → 11 NVIDIA agents → Gemini → candidates as base64 in response. POST /feedback reruns with state deltas.

**Why:** User explicitly chose: synchronous (no queue), local-only storage (no MinIO/S3/DB), stateless (SessionState passed in request and returned in response, frontend holds it).

**How to apply:** Never suggest adding a database, Redis, or object storage unless user asks. Keep pipeline synchronous. SessionState is the only persistence — it travels in request/response bodies.
