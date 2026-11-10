from django.conf import settings

APP_LABEL = 'alert_store'
ALERTS_ALIAS = 'alerts'


def _alerts_alias():
    """Use the Supabase "alerts" database when configured, else the default DB."""
    return ALERTS_ALIAS if ALERTS_ALIAS in settings.DATABASES else 'default'


class AlertStoreRouter:
    """
    Sends alert_store models to the Supabase database (alias "alerts") and keeps
    every other app on the default database, so only `live_alerts` is created
    in Supabase.
    """

    def db_for_read(self, model, **hints):
        if model._meta.app_label == APP_LABEL:
            return _alerts_alias()
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == APP_LABEL:
            return _alerts_alias()
        return None

    def allow_relation(self, obj1, obj2, **hints):
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == APP_LABEL:
            return db == _alerts_alias()
        if db == ALERTS_ALIAS:
            return False
        return None
