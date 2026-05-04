from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pixii_api.config import settings
from pixii_api.routers import enhance, feedback, health

app = FastAPI(title="Pixii API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(enhance.router)
app.include_router(feedback.router)
