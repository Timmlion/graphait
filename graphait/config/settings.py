import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    sqlite_path: str = "graphait.db"
    secret_key: str = "dev-secret-key-replace-in-production-min-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.sqlite_path}"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
