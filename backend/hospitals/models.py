from django.db import models
import sys
import os

DB_ENGINE = os.getenv('DB_ENGINE', 'sqlite')
IS_MANAGED = (DB_ENGINE == 'sqlite') or ('test' in sys.argv)



class Hospital(models.Model):
    hospital_id = models.CharField(max_length=50, primary_key=True)
    hospital_name = models.CharField(max_length=255, blank=True, null=True)
    hospital_code = models.CharField(max_length=50, blank=True, null=True)
    status = models.CharField(max_length=50, default='ACTIVE')
    expected_interval_minutes = models.IntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, blank=True, null=True)

    class Meta:
        db_table = 'hospitals'
        managed = IS_MANAGED

    @property
    def display_name(self):
        return self.hospital_name or self.hospital_code or self.hospital_id

    @property
    def display_city(self):
        if self.hospital_name and ',' in self.hospital_name:
            return self.hospital_name.split(',')[1].strip()
        return 'India'

    @property
    def name(self):
        return self.display_name

    @property
    def city(self):
        return self.display_city

    @property
    def last_data_received(self):
        return 'Just now'

    @property
    def expected_data_time(self):
        return '12:00 PM'

    @property
    def delay_minutes(self):
        return 0

    @property
    def data_frequency(self):
        return self.expected_interval_minutes or 30

    @property
    def data_volume_mb(self):
        return 0.0

    @property
    def records_received(self):
        return 0

    @property
    def service_status(self):
        return 'running' if (self.status and self.status.upper() == 'ACTIVE') else 'stopped'

    @property
    def data_quality(self):
        return 100

    @property
    def aws_cost(self):
        return 800

    @property
    def ip_address(self):
        return '10.142.0.1'

    @property
    def region(self):
        return 'ap-south-1'

    @property
    def api_endpoint(self):
        return f"/api/hospitals/{self.hospital_id}/"

    def __str__(self):
        return f"{self.display_name} ({self.hospital_id})"


class Encounter(models.Model):
    id = models.BigAutoField(primary_key=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        db_column='hospital_id',
        to_field='hospital_id',
        related_name='encounters',
        blank=True,
        null=True
    )
    patient_uhid = models.CharField(max_length=100, blank=True, null=True)
    patient_name = models.CharField(max_length=255, blank=True, null=True)
    title = models.CharField(max_length=20, blank=True, null=True)
    gender = models.CharField(max_length=20, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    initial_registration_date = models.DateField(blank=True, null=True)
    age = models.IntegerField(blank=True, null=True)
    encounter_no = models.CharField(max_length=100, blank=True, null=True)
    visit_date = models.DateField(blank=True, null=True)
    visit_type = models.CharField(max_length=50, blank=True, null=True)
    area_code = models.CharField(max_length=50, blank=True, null=True)
    area_name = models.CharField(max_length=100, blank=True, null=True)
    bed = models.CharField(max_length=50, blank=True, null=True)
    clinician_code = models.CharField(max_length=50, blank=True, null=True)
    clinician_name = models.CharField(max_length=255, blank=True, null=True)
    specialty_code = models.CharField(max_length=50, blank=True, null=True)
    specialty_name = models.CharField(max_length=255, blank=True, null=True)
    admission_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'encounters'
        managed = IS_MANAGED

    def __str__(self):
        return f"Encounter {self.encounter_no or self.id} - {self.patient_uhid}"


class Discharge(models.Model):
    id = models.BigAutoField(primary_key=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        db_column='hospital_id',
        to_field='hospital_id',
        related_name='discharges',
        blank=True,
        null=True
    )
    patient_uhid = models.CharField(max_length=100, blank=True, null=True)
    encounter_no = models.CharField(max_length=100, blank=True, null=True)
    admission_date = models.DateField(blank=True, null=True)
    discharge_date = models.DateField(blank=True, null=True)
    discharge_type = models.CharField(max_length=50, blank=True, null=True)
    discharged_by_user_code = models.CharField(max_length=50, blank=True, null=True)
    discharged_by_user_name = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'discharges'
        managed = IS_MANAGED

    def __str__(self):
        return f"Discharge {self.encounter_no or self.id} - {self.patient_uhid}"


class DataIngestionLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        db_column='hospital_id',
        to_field='hospital_id',
        related_name='ingestion_logs',
        blank=True,
        null=True
    )
    data_type = models.CharField(max_length=50, blank=True, null=True)
    received_at = models.DateTimeField(blank=True, null=True)
    expected_at = models.DateTimeField(blank=True, null=True)
    record_count = models.IntegerField(default=0)
    status = models.CharField(max_length=50, blank=True, null=True)
    response_time_ms = models.IntegerField(blank=True, null=True)
    data_size_mb = models.FloatField(blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'data_ingestion_log'
        managed = IS_MANAGED

    def __str__(self):
        return f"IngestionLog {self.id} - {self.hospital_id} ({self.status})"


class Alert(models.Model):
    SEVERITY_CHOICES = [
        ('INFO', 'INFO'),
        ('WARNING', 'WARNING'),
        ('CRITICAL', 'CRITICAL'),
    ]

    STATUS_CHOICES = [
        ('ACTIVE', 'ACTIVE'),
        ('ACKNOWLEDGED', 'ACKNOWLEDGED'),
        ('RESOLVED', 'RESOLVED'),
    ]

    id = models.BigAutoField(primary_key=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        db_column='hospital_id',
        to_field='hospital_id',
        related_name='alerts',
        blank=True,
        null=True
    )
    alert_type = models.CharField(max_length=50, blank=True, null=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='WARNING')
    message = models.TextField(blank=True, null=True)
    metric_name = models.CharField(max_length=50, blank=True, null=True)
    metric_value = models.FloatField(blank=True, null=True)
    threshold_value = models.FloatField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    detected_at = models.DateTimeField(blank=True, null=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'alerts'
        managed = IS_MANAGED

    @property
    def hospital_name_display(self):
        return self.hospital.display_name if self.hospital else ''

    @property
    def type(self):
        return (self.severity or 'WARNING').lower()

    @property
    def title(self):
        return self.alert_type or 'Alert'

    @property
    def time(self):
        return self.detected_at.isoformat() if self.detected_at else ''

    @property
    def last_received(self):
        return ''

    @property
    def expected_time(self):
        return ''

    @property
    def category(self):
        return self.metric_name or 'delay'

    @property
    def is_read(self):
        return self.status in ['ACKNOWLEDGED', 'RESOLVED']

    def __str__(self):
        return f"Alert {self.id} - {self.alert_type or self.title} ({self.status})"


class AlertAcknowledgment(models.Model):
    alert_id = models.CharField(max_length=255, primary_key=True)
    hospital_code = models.CharField(max_length=50, blank=True, null=True)
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'alert_acknowledgments'
        managed = IS_MANAGED

    def __str__(self):
        return f"Acknowledgment for {self.alert_id} at {self.acknowledged_at}"


