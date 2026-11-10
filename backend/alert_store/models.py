import datetime

from django.db import models
from django.utils import timezone


class LiveAlert(models.Model):
    """
    Persistent record of a live-sync alert, shared by every browser/TV.

    One row per distinct error. `alert_key` is the stable, content-based ID the
    frontend builds (hash of hospital + data structure + time + error text), so
    the same error always maps to the same row. Once `is_acknowledged` is True
    it is acknowledged for every client. Rows are kept for RETENTION_DAYS and
    then purged (see purge_expired).

    This app lives on the Supabase database (DB alias "alerts", see
    alert_store/routers.py); the rest of the backend is unaffected.
    """
    RETENTION_DAYS = 20

    SEVERITY_CHOICES = [
        ('INFO', 'INFO'),
        ('WARNING', 'WARNING'),
        ('CRITICAL', 'CRITICAL'),
    ]

    id = models.BigAutoField(primary_key=True)
    alert_key = models.CharField(max_length=255, unique=True)
    hospital_code = models.CharField(max_length=50, blank=True, default='', db_index=True)
    hospital_name = models.CharField(max_length=255, blank=True, default='')
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='CRITICAL')
    title = models.CharField(max_length=255, blank=True, default='')
    message = models.TextField(blank=True, default='')
    category = models.CharField(max_length=100, blank=True, default='')
    error_time = models.DateTimeField(blank=True, null=True)
    insert_sql = models.TextField(blank=True, null=True)
    update_sql = models.TextField(blank=True, null=True)
    general_sql = models.TextField(blank=True, null=True)

    is_acknowledged = models.BooleanField(default=False, db_index=True)
    acknowledged_at = models.DateTimeField(blank=True, null=True)
    acknowledged_by = models.CharField(max_length=255, blank=True, default='')

    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'live_alerts'
        ordering = ['-error_time', '-id']
        indexes = [
            models.Index(fields=['hospital_code', 'is_acknowledged'], name='live_alert_hosp_ack_idx'),
            models.Index(fields=['first_seen_at'], name='live_alert_first_seen_idx'),
        ]

    @classmethod
    def purge_expired(cls):
        """Delete alerts first seen more than RETENTION_DAYS ago."""
        cutoff = timezone.now() - datetime.timedelta(days=cls.RETENTION_DAYS)
        return cls.objects.filter(first_seen_at__lt=cutoff).delete()

    def __str__(self):
        state = 'ACK' if self.is_acknowledged else 'ACTIVE'
        return f"{self.hospital_code} - {self.title or self.alert_key} ({state})"
