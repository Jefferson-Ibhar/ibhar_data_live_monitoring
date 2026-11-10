import os

from django.apps import AppConfig
from django.db.backends.signals import connection_created


def _set_search_path(sender, connection, **kwargs):
    """Point every new PostgreSQL connection at the Supabase schema (DB_SCHEMA).

    Done after connecting (not via startup options) so it also works through
    the Supabase session pooler. The schema name is case-sensitive, hence the
    double quotes. Requires session mode (port 5432), not the 6543 pooler.
    """
    schema = os.getenv('DB_SCHEMA', '').strip()
    if schema and connection.vendor == 'postgresql':
        safe = schema.replace('"', '""')
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{safe}", public')


class AlertStoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'alert_store'

    def ready(self):
        connection_created.connect(_set_search_path)
