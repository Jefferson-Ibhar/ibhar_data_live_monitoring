import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', os.getenv('SECRET_KEY', 'django-insecure-default-key-change-it-in-production'))
DEBUG = os.getenv('DEBUG', 'True') == 'True'

# Cloud Run terminates TLS at the load balancer and forwards over HTTP,
# so trust the X-Forwarded-Proto header it sets.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]
# Cloud Run's own *.run.app domain is always allowed so the service works
# out of the box; add your custom domain via the ALLOWED_HOSTS env var.
ALLOWED_HOSTS.append('.run.app')

CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()]

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'corsheaders',
    'drf_spectacular',
    
    # Local apps
    'hospitals',
    'aws_costs',
    'alert_store',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend_project.wsgi.application'


# Database
from urllib.parse import urlparse, unquote

# DATABASE_URL (e.g. postgresql://user:pass@host:5432/postgres) takes priority.
# Special characters in the password must be URL-encoded (@ -> %40, # -> %23).
DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
_db_url = urlparse(DATABASE_URL) if DATABASE_URL else None

# The main app DB is chosen by DB_ENGINE exactly as before (SQLite by default).
# DATABASE_URL only configures the separate Supabase "alerts" database below.
DB_ENGINE = os.getenv('DB_ENGINE', 'sqlite')
IS_TESTING = 'test' in sys.argv

# Supabase API settings (backend-only; the service role key bypasses RLS and
# must never be exposed to the frontend or committed to git).
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

if DB_ENGINE == 'postgresql' and not IS_TESTING:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'postgres'),
            'USER': os.getenv('DB_USER', 'postgres'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# Supabase (PostgreSQL) database that holds ONLY the alert_store tables
# (live_alerts). Routed by alert_store.routers.AlertStoreRouter. If DATABASE_URL
# is not set, alerts fall back to the default database.
if _db_url and not IS_TESTING:
    DATABASES['alerts'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': _db_url.path.lstrip('/') or 'postgres',
        'USER': unquote(_db_url.username or 'postgres'),
        'PASSWORD': unquote(_db_url.password or ''),
        'HOST': _db_url.hostname or 'localhost',
        'PORT': str(_db_url.port or 5432),
        'OPTIONS': {'sslmode': os.getenv('DB_SSLMODE', 'require')},
    }

DATABASE_ROUTERS = ['alert_store.routers.AlertStoreRouter']

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage" if not IS_TESTING else "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'IBHAR Live Hospital Data Monitoring API',
    'DESCRIPTION': 'REST API for Live Hospital Telemetry, Ingestion & Alerts Monitoring',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# CORS settings
CORS_ALLOWED_ORIGINS = [orig.strip() for orig in os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if orig.strip()]

# Live Hospital Monitoring External REST API Configuration (loaded from .env)
LIVE_SYNC_API_URL = os.getenv('LIVE_SYNC_API_URL')
LIVE_SYNC_USER_CODE = os.getenv('LIVE_SYNC_USER_CODE', '')
LIVE_SYNC_HOSPITAL_CODES = [c.strip() for c in os.getenv('LIVE_SYNC_HOSPITAL_CODES', '').split(',') if c.strip()]
LIVE_SYNC_EXPECTED_INTERVAL_MINUTES = int(os.getenv('LIVE_SYNC_EXPECTED_INTERVAL_MINUTES', '30'))

# AWS Cost & Usage Dashboard Settings
AWS_COST_MODE = os.getenv('AWS_COST_MODE', 'real' if os.getenv('AWS_ACCESS_KEY_ID') else 'mock')
AWS_REGION = os.getenv('AWS_REGION', 'ap-south-1')
AWS_COST_CACHE_TTL_HOURLY = int(os.getenv('AWS_COST_CACHE_TTL_HOURLY', '900'))
AWS_COST_CACHE_TTL_DAILY = int(os.getenv('AWS_COST_CACHE_TTL_DAILY', '21600'))

# Auto-normalize AWS credentials in environment if present
if os.getenv('AWS_ACCESS_KEY_ID'):
    os.environ['AWS_ACCESS_KEY_ID'] = os.getenv('AWS_ACCESS_KEY_ID', '').strip().upper()
if os.getenv('AWS_SECRET_ACCESS_KEY'):
    os.environ['AWS_SECRET_ACCESS_KEY'] = os.getenv('AWS_SECRET_ACCESS_KEY', '').strip()
