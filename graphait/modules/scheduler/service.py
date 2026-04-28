import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

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

    def schedule_agent(self, agent_id: str, interval_seconds: int) -> None:
        if not self._scheduler:
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

    def remove_agent(self, agent_id: str) -> None:
        if not self._scheduler:
            return
        job_id = f"agent_{agent_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)

    def trigger_agent(self, agent_id: str) -> None:
        """Fire agent immediately (called when task is assigned)."""
        if not self._scheduler:
            return
        job_id = f"agent_{agent_id}"
        job = self._scheduler.get_job(job_id)
        if job:
            job.modify(next_run_time=datetime.now(timezone.utc))
        else:
            self._scheduler.add_job(
                _run_sync,
                "date",
                run_date=datetime.now(timezone.utc),
                args=[agent_id],
                id=f"trigger_{agent_id}",
                replace_existing=True,
            )


def _run_sync(agent_id: str) -> None:
    from graphait.modules.scheduler.worker import run_agent_tick
    asyncio.run(run_agent_tick(agent_id))


scheduler_service = SchedulerService()
