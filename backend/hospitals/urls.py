from django.urls import path
from .views import (
    HealthCheckView,
    HospitalListView,
    HospitalDetailView,
    HospitalComparisonView,
    EncounterListView,
    EncounterDetailView,
    DischargeListView,
    DischargeDetailView,
    DataIngestionListView,
    DataIngestionLatestView,
    IntegrationHealthView,
    IntegrationTrendView,
    IntegrationHealthTrendView,
    AlertListView,
    AlertDetailView,
    AlertAcknowledgeView,
    DashboardView,
    AnalyticsView,
    ReportsOverviewView,
    ReportDataSummaryView,
    ReportDelayView,
    ReportVolumeView,
    ReportLatencyView,
    ReportErrorView,
    ReportIntegrationHealthView
)
from .live_views import live_dashboard, live_hospital

urlpatterns = [
    # Live Monitoring APIs (External REST API Data Source)
    path('live/dashboard/', live_dashboard, name='live-dashboard'),
    path('live/hospitals/<str:code>/', live_hospital, name='live-hospital'),

    # Health Check
    path('health/', HealthCheckView.as_view(), name='health'),

    # Hospital APIs
    path('hospitals/', HospitalListView.as_view(), name='hospital-list'),
    path('hospitals/comparison/', HospitalComparisonView.as_view(), name='hospital-comparison'),
    path('hospitals/<str:hospital_id>/', HospitalDetailView.as_view(), name='hospital-detail'),

    # Encounter APIs
    path('encounters/', EncounterListView.as_view(), name='encounter-list'),
    path('encounters/<int:pk>/', EncounterDetailView.as_view(), name='encounter-detail'),

    # Discharge APIs
    path('discharges/', DischargeListView.as_view(), name='discharge-list'),
    path('discharges/<int:pk>/', DischargeDetailView.as_view(), name='discharge-detail'),

    # Data Ingestion APIs
    path('ingestion/', DataIngestionListView.as_view(), name='ingestion-list'),
    path('ingestion/health/', IntegrationHealthView.as_view(), name='ingestion-health'),
    path('ingestion/trend/', IntegrationTrendView.as_view(), name='ingestion-trend'),
    path('ingestion/health-trend/', IntegrationHealthTrendView.as_view(), name='ingestion-health-trend'),
    path('ingestion/latest/<str:hospital_id>/', DataIngestionLatestView.as_view(), name='ingestion-latest'),

    # Alert APIs
    path('alerts/', AlertListView.as_view(), name='alert-list'),
    path('alerts/acknowledge/', AlertAcknowledgeView.as_view(), name='alert-acknowledge'),
    path('alerts/acknowledged/', AlertAcknowledgeView.as_view(), name='alert-acknowledged'),
    path('alerts/<int:pk>/', AlertDetailView.as_view(), name='alert-detail'),
    path('alerts/<int:pk>/read/', AlertDetailView.as_view(), name='alert-read'),

    # Dashboard & Analytics
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('analytics/', AnalyticsView.as_view(), name='analytics'),
    path('analytics/<str:hospital_id>/', AnalyticsView.as_view(), name='analytics-hospital'),

    # Reports APIs
    path('reports/', ReportsOverviewView.as_view(), name='reports-overview'),
    path('reports/summary/', ReportDataSummaryView.as_view(), name='report-summary'),
    path('reports/delay/', ReportDelayView.as_view(), name='report-delay'),
    path('reports/volume/', ReportVolumeView.as_view(), name='report-volume'),
    path('reports/latency/', ReportLatencyView.as_view(), name='report-latency'),
    path('reports/errors/', ReportErrorView.as_view(), name='report-errors'),
    path('reports/integration-health/', ReportIntegrationHealthView.as_view(), name='report-integration-health'),
]

