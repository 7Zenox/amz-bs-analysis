from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "local"
    nvidia_api_key: str
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_default_model: str = "moonshotai/kimi-k2.6"
    nvidia_image_api_key: str
    nvidia_image_base_url: str = "https://ai.api.nvidia.com/v1/genai"
    nvidia_image_model: str = "black-forest-labs/flux.2-klein-4b"
    max_retry_budget: int = 3
    n_candidates: int = 3
    allowed_origins: str = "http://localhost:3000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()  # type: ignore[call-arg]
