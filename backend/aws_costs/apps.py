import logging
import os
import sys
import threading
import time
from django.apps import AppConfig

logger = logging.getLogger(__name__)


def _background_twice_daily_worker():
    """
    Background worker that periodically checks whether 12 hours have elapsed
    since the last AWS Cost snapshot, keeping telemetry fresh strictly twice a day.
    """
    time.sleep(20)  # Initial grace period after startup
    while True:
        try:
            from aws_costs.services.snapshot import get_or_create_latest_snapshot
            get_or_create_latest_snapshot()
        except Exception as e:
            logger.warning(f"Background AWS twice-daily check failed: {e}")
        time.sleep(600)  # Check every 10 minutes


class AwsCostsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'aws_costs'
    verbose_name = 'AWS Cost & Usage Monitoring'

    def ready(self):
        # Don't run background threads during manage.py utility commands
        skip_commands = {'migrate', 'makemigrations', 'collectstatic', 'shell', 'test', 'createsuperuser'}
        if any(cmd in sys.argv for cmd in skip_commands):
            return

        # Start background thread in gunicorn/runserver main processes
        if os.environ.get('RUN_MAIN') == 'true' or 'manage.py' not in sys.argv or 'runserver' in sys.argv:
            worker_thread = threading.Thread(
                target=_background_twice_daily_worker,
                daemon=True,
                name="AwsCostTwiceDailyWorker"
            )
            worker_thread.start()
            logger.info("AwsCostTwiceDailyWorker started (twice-daily 12h policy).")
