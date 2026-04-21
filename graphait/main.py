from fastapi import FastAPI
from graphait.api.v1.router import router


def create_app() -> FastAPI:
    app = FastAPI(title="Graphait", version="0.1.0")
    app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
