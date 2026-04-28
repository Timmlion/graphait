from fastapi import APIRouter
from graphait.api.v1 import auth, agents, tasks, graph, org, skills

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(agents.router, prefix="/agents", tags=["agents"])
router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
router.include_router(graph.router, prefix="/graph", tags=["graph"])
router.include_router(org.router, prefix="/org", tags=["org"])
router.include_router(skills.router, prefix="/skills", tags=["skills"])
