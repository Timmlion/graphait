from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://graphait:graphait@db:5432/graphait"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = "change-me-in-production-min-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    @field_validator("secret_key")
    @classmethod
    def secret_key_must_not_be_placeholder(cls, v: str) -> str:
        if v == "change-me-in-production-min-32-chars":
            raise ValueError(
                "SECRET_KEY must be set to a strong random value. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    model_config = {"env_file": ".env"}


settings = Settings()
