import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from alert_store.models import LiveAlert

ALERT = {
    'id': 'live-alert-H1-abc123',
    'hospital_code': 'H1',
    'hospital_name': 'Hospital One',
    'severity': 'CRITICAL',
    'title': 'Live Sync Error: IN_PATIENT_INFO',
    'message': 'boom',
    'category': 'IN_PATIENT_INFO',
    'time': '2026-11-05 10:30:00',
}


class AlertAcknowledgeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_ack_is_visible_to_every_client(self):
        r = self.client.post('/api/alerts/acknowledge/', {'alert_id': ALERT['id'], 'alerts': [ALERT]}, format='json')
        self.assertEqual(r.status_code, 200)

        # A different client/system asks which alerts are acknowledged.
        other = APIClient().get('/api/alerts/acknowledged/')
        self.assertIn(ALERT['id'], other.json()['acknowledged_ids'])

    def test_details_are_stored_and_ack_is_idempotent(self):
        for _ in range(2):
            self.client.post('/api/alerts/acknowledge/', {'alerts': [ALERT]}, format='json')
        self.assertEqual(LiveAlert.objects.count(), 1)
        row = LiveAlert.objects.get()
        self.assertTrue(row.is_acknowledged)
        self.assertEqual(row.hospital_name, 'Hospital One')
        self.assertEqual(row.message, 'boom')
        self.assertIsNotNone(row.error_time)

    def test_id_only_ack_still_works(self):
        r = self.client.post('/api/alerts/acknowledge/', {'alert_ids': ['a', 'b']}, format='json')
        self.assertEqual(r.json()['acknowledged_count'], 2)
        self.assertEqual(LiveAlert.objects.filter(is_acknowledged=True).count(), 2)

    def test_rows_older_than_20_days_are_purged(self):
        old = LiveAlert.objects.create(alert_key='old', is_acknowledged=True)
        LiveAlert.objects.filter(pk=old.pk).update(first_seen_at=timezone.now() - datetime.timedelta(days=21))
        ids = self.client.get('/api/alerts/acknowledged/').json()['acknowledged_ids']
        self.assertNotIn('old', ids)
        self.assertFalse(LiveAlert.objects.filter(alert_key='old').exists())
