from contextlib import asynccontextmanager
from fastapi import FastAPI
from graphait.api.v1.router import router
from graphait.modules.scheduler.service import scheduler_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        scheduler_service.start()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Scheduler failed to start: %s", e)
    yield
    scheduler_service.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Graphait", version="0.1.0", lifespan=lifespan)
    app.include_router(router, prefix="/api/v1")

    @app.get("/api/v1/health", tags=["health"])
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
