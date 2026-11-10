from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='LiveAlert',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('alert_key', models.CharField(max_length=255, unique=True)),
                ('hospital_code', models.CharField(blank=True, db_index=True, default='', max_length=50)),
                ('hospital_name', models.CharField(blank=True, default='', max_length=255)),
                ('severity', models.CharField(
                    choices=[('INFO', 'INFO'), ('WARNING', 'WARNING'), ('CRITICAL', 'CRITICAL')],
                    default='CRITICAL', max_length=20)),
                ('title', models.CharField(blank=True, default='', max_length=255)),
                ('message', models.TextField(blank=True, default='')),
                ('category', models.CharField(blank=True, default='', max_length=100)),
                ('error_time', models.DateTimeField(blank=True, null=True)),
                ('insert_sql', models.TextField(blank=True, null=True)),
                ('update_sql', models.TextField(blank=True, null=True)),
                ('general_sql', models.TextField(blank=True, null=True)),
                ('is_acknowledged', models.BooleanField(db_index=True, default=False)),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('acknowledged_by', models.CharField(blank=True, default='', max_length=255)),
                ('first_seen_at', models.DateTimeField(auto_now_add=True)),
                ('last_seen_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'live_alerts',
                'ordering': ['-error_time', '-id'],
                'indexes': [
                    models.Index(fields=['hospital_code', 'is_acknowledged'], name='live_alert_hosp_ack_idx'),
                    models.Index(fields=['first_seen_at'], name='live_alert_first_seen_idx'),
                ],
            },
        ),
    ]
