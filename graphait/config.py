from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://graphait:graphait@db:5432/graphait"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = "change-me-in-production-min-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    class Config:
        env_file = ".env"


settings = Settings()
