from fastapi import APIRouter
from graphait.api.v1 import auth, agents, tasks, graph, schedules

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(agents.router, prefix="/agents", tags=["agents"])
router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
router.include_router(graph.router, prefix="/graph", tags=["graph"])
router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
