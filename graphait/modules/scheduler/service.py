import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from graphait.modules.scheduler.worker import run_agent_tick

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        self._scheduler = None

    def start(self) -> None:
        self._scheduler = BackgroundScheduler()
        self._scheduler.start()
        logger.info("Scheduler started")

    def stop(self) -> None:
        if self._scheduler:
            self._scheduler.shutdown(wait=False)

    def schedule_agent(self, agent_id: uuid.UUID, interval_seconds: int) -> None:
        if not self._scheduler:
            logger.warning("schedule_agent called but scheduler is not running (agent_id=%s)", agent_id)
            return
        job_id = f"agent_{agent_id}"
        self._scheduler.add_job(
            _run_sync,
            "interval",
            seconds=interval_seconds,
            args=[agent_id],
            id=job_id,
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=interval_seconds),
        )

    def remove_agent(self, agent_id: uuid.UUID) -> None:
        if not self._scheduler:
            return
        job_id = f"agent_{agent_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)


def _run_sync(agent_id: uuid.UUID) -> None:
    asyncio.run(run_agent_tick(agent_id))


scheduler_service = SchedulerService()
