from urllib.parse import quote_plus
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_user: str = "graphait"
    postgres_password: str = "graphait"
    postgres_db: str = "graphait"

    redis_url: str = "redis://redis:6379/0"
    secret_key: str = "change-me-in-production-min-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    @property
    def database_url(self) -> str:
        pw = quote_plus(self.postgres_password)
        return (
            f"postgresql://{self.postgres_user}:{pw}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

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
