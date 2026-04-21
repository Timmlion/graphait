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
        try:
            from apscheduler.jobstores.redis import RedisJobStore
            from graphait.config import settings
            import urllib.parse

            parsed = urllib.parse.urlparse(settings.redis_url)
            jobstores = {
                "default": RedisJobStore(
                    jobs_key="graphait:jobs",
                    run_times_key="graphait:run_times",
                    host=parsed.hostname or "redis",
                    port=parsed.port or 6379,
                    db=int(parsed.path.lstrip("/") or 0),
                )
            }
            self._scheduler = BackgroundScheduler(jobstores=jobstores)
        except Exception as e:
            logger.warning("Redis unavailable, using in-memory job store: %s", e)
            self._scheduler = BackgroundScheduler()

        self._scheduler.start()
        logger.info("Scheduler started")

    def stop(self) -> None:
        if self._scheduler:
            self._scheduler.shutdown(wait=False)

    def schedule_agent(self, agent_id: uuid.UUID, interval_seconds: int) -> None:
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

    def remove_agent(self, agent_id: uuid.UUID) -> None:
        if not self._scheduler:
            return
        job_id = f"agent_{agent_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)


def _run_sync(agent_id: uuid.UUID) -> None:
    asyncio.run(run_agent_tick(agent_id))


scheduler_service = SchedulerService()
