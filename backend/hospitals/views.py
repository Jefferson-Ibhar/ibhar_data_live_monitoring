import datetime
import logging
from django.db import connection
from django.db.models import Q, Count, Avg, Sum
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiParameter

from alert_store.models import LiveAlert
from .live_sync_service import parse_sync_timestamp
from .models import Hospital, Encounter, Discharge, DataIngestionLog, Alert
from .serializers import (
    HospitalSerializer,
    EncounterSerializer,
    DischargeSerializer,
    DataIngestionLogSerializer,
    AlertSerializer
)
from .services import calculate_hospital_status, get_hospital_summary, make_aware_if_needed
from . import report_services

logger = logging.getLogger(__name__)


def paginate_queryset(queryset, request, default_size=20):
    """
    Standard pagination helper returning page, page_size, total, total_pages, and paginated slice.
    """
    try:
        page = int(request.query_params.get('page', 1))
    except ValueError:
        page = 1

    try:
        page_size = int(request.query_params.get('page_size', default_size))
    except ValueError:
        page_size = default_size

    page = max(1, page)
    page_size = max(1, min(100, page_size))

    total = queryset.count()
    total_pages = max(1, (total + page_size - 1) // page_size)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    return items, {
        'page': page,
        'page_size': page_size,
        'total': total,
        'total_pages': total_pages
    }


class HealthCheckView(APIView):
    """
    GET /api/health/ - Verify system status and PostgreSQL DB connectivity.
    """
    @extend_schema(summary="Health check API endpoint")
    def get(self, request):
        db_status = "disconnected"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                row = cursor.fetchone()
                if row:
                    db_status = "connected"
        except Exception:
            db_status = "error"

        return Response({
            "status": "ok" if db_status == "connected" else "degraded",
            "database": db_status
        }, status=status.HTTP_200_OK if db_status == "connected" else status.HTTP_503_SERVICE_UNAVAILABLE)


class HospitalListView(APIView):
    """
    GET /api/hospitals/ - Search, filter, and paginate hospital nodes.
    """
    @extend_schema(
        summary="List hospitals",
        parameters=[
            OpenApiParameter("search", str, description="Search by hospital name or code"),
            OpenApiParameter("status", str, description="Filter by status (ACTIVE, HEALTHY, etc.)"),
            OpenApiParameter("page", int, description="Page number"),
            OpenApiParameter("page_size", int, description="Page size"),
            OpenApiParameter("ordering", str, description="Field to order by"),
        ]
    )
    def get(self, request):
        queryset = Hospital.objects.all()

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(hospital_name__icontains=search) |
                Q(name__icontains=search) |
                Q(hospital_code__icontains=search) |
                Q(hospital_id__icontains=search) |
                Q(city__icontains=search)
            )

        status_param = request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status__iexact=status_param)

        ordering = request.query_params.get('ordering')
        if ordering:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by('hospital_id')

        items, pagination = paginate_queryset(queryset, request)
        serializer = HospitalSerializer(items, many=True)

        return Response({
            "success": True,
            "data": serializer.data,
            "pagination": pagination
        }, status=status.HTTP_200_OK)


class HospitalDetailView(APIView):
    """
    GET /api/hospitals/<hospital_id>/ - Retrieve single hospital summary.
    """
    @extend_schema(summary="Get hospital details by hospital_id")
    def get(self, request, hospital_id):
        summary = get_hospital_summary(hospital_id)
        if not summary:
            return Response({
                "success": False,
                "error": {
                    "code": "HOSPITAL_NOT_FOUND",
                    "message": f"Hospital {hospital_id} was not found."
                }
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "success": True,
            "data": summary
        }, status=status.HTTP_200_OK)


class HospitalComparisonView(APIView):
    """
    GET /api/hospitals/comparison/ - Compare performance metrics across hospitals.
    """
    @extend_schema(summary="Get hospital metrics comparison")
    def get(self, request):
        hospitals = Hospital.objects.all()
        comparison = []

        for h in hospitals:
            enc_count = Encounter.objects.filter(hospital_id=h.hospital_id).count()
            dis_count = Discharge.objects.filter(hospital_id=h.hospital_id).count()
            active_alerts = Alert.objects.filter(hospital_id=h.hospital_id, status='ACTIVE').count()
            ingestion_agg = DataIngestionLog.objects.filter(hospital_id=h.hospital_id).aggregate(
                total_records=Sum('record_count'),
                total_volume=Sum('data_size_mb'),
                avg_response=Avg('response_time_ms')
            )

            comparison.append({
                "hospital_id": h.hospital_id,
                "hospital_name": h.display_name,
                "encounter_count": enc_count,
                "discharge_count": dis_count,
                "record_count": ingestion_agg['total_records'] or 0,
                "data_volume_mb": ingestion_agg['total_volume'] or None,
                "average_response_time_ms": int(ingestion_agg['avg_response']) if ingestion_agg['avg_response'] is not None else None,
                "active_alerts": active_alerts
            })

        return Response({
            "success": True,
            "data": comparison
        }, status=status.HTTP_200_OK)


class EncounterListView(APIView):
    """
    GET /api/encounters/ - Filter and paginate patient encounters.
    """
    @extend_schema(summary="List patient encounters")
    def get(self, request):
        queryset = Encounter.objects.all()

        hospital_id = request.query_params.get('hospital_id')
        if hospital_id:
            queryset = queryset.filter(hospital_id=hospital_id)

        patient_uhid = request.query_params.get('patient_uhid')
        if patient_uhid:
            queryset = queryset.filter(patient_uhid=patient_uhid)

        encounter_no = request.query_params.get('encounter_no')
        if encounter_no:
            queryset = queryset.filter(encounter_no=encounter_no)

        visit_type = request.query_params.get('visit_type')
        if visit_type:
            queryset = queryset.filter(visit_type=visit_type)

        specialty = request.query_params.get('specialty')
        if specialty:
            queryset = queryset.filter(Q(specialty_name__icontains=specialty) | Q(specialty_code__icontains=specialty))

        start_date = request.query_params.get('start_date')
        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)

        end_date = request.query_params.get('end_date')
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)

        items, pagination = paginate_queryset(queryset, request)
        serializer = EncounterSerializer(items, many=True)

        return Response({
            "success": True,
            "data": serializer.data,
            "pagination": pagination
        }, status=status.HTTP_200_OK)


class EncounterDetailView(APIView):
    """
    GET /api/encounters/<id>/ - Single encounter.
    """
    @extend_schema(summary="Get encounter by ID")
    def get(self, request, pk):
        try:
            encounter = Encounter.objects.get(pk=pk)
        except Encounter.DoesNotExist:
            return Response({
                "success": False,
                "error": {
                    "code": "ENCOUNTER_NOT_FOUND",
                    "message": f"Encounter {pk} was not found."
                }
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = EncounterSerializer(encounter)
        return Response({
            "success": True,
            "data": serializer.data
        }, status=status.HTTP_200_OK)


class DischargeListView(APIView):
    """
    GET /api/discharges/ - Filter and paginate patient discharges.
    """
    @extend_schema(summary="List patient discharges")
    def get(self, request):
        queryset = Discharge.objects.all()

        hospital_id = request.query_params.get('hospital_id')
        if hospital_id:
            queryset = queryset.filter(hospital_id=hospital_id)

        patient_uhid = request.query_params.get('patient_uhid')
        if patient_uhid:
            queryset = queryset.filter(patient_uhid=patient_uhid)

        encounter_no = request.query_params.get('encounter_no')
        if encounter_no:
            queryset = queryset.filter(encounter_no=encounter_no)

        discharge_type = request.query_params.get('discharge_type')
        if discharge_type:
            queryset = queryset.filter(discharge_type=discharge_type)

        start_date = request.query_params.get('start_date')
        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)

        end_date = request.query_params.get('end_date')
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)

        items, pagination = paginate_queryset(queryset, request)
        serializer = DischargeSerializer(items, many=True)

        return Response({
            "success": True,
            "data": serializer.data,
            "pagination": pagination
        }, status=status.HTTP_200_OK)


class DischargeDetailView(APIView):
    """
    GET /api/discharges/<id>/ - Single discharge.
    """
    @extend_schema(summary="Get discharge by ID")
    def get(self, request, pk):
        try:
            discharge = Discharge.objects.get(pk=pk)
        except Discharge.DoesNotExist:
            return Response({
                "success": False,
                "error": {
                    "code": "DISCHARGE_NOT_FOUND",
                    "message": f"Discharge {pk} was not found."
                }
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = DischargeSerializer(discharge)
        return Response({
            "success": True,
            "data": serializer.data
        }, status=status.HTTP_200_OK)


class DataIngestionListView(APIView):
    """
    GET /api/ingestion/ - Filter and paginate telemetry ingestion logs.
    """
    @extend_schema(summary="List data ingestion logs")
    def get(self, request):
        queryset = DataIngestionLog.objects.all()

        hospital_id = request.query_params.get('hospital_id')
        if hospital_id:
            queryset = queryset.filter(hospital_id=hospital_id)

        data_type = request.query_params.get('data_type')
        if data_type:
            queryset = queryset.filter(data_type=data_type)

        status_param = request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        start_date = request.query_params.get('start_date')
        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)

        end_date = request.query_params.get('end_date')
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)

        items, pagination = paginate_queryset(queryset, request)
        serializer = DataIngestionLogSerializer(items, many=True)

        return Response({
            "success": True,
            "data": serializer.data,
            "pagination": pagination
        }, status=status.HTTP_200_OK)


class DataIngestionLatestView(APIView):
    """
    GET /api/ingestion/latest/<hospital_id>/ - Get latest ingestion log for a hospital.
    """
    @extend_schema(summary="Get latest data ingestion log for a hospital")
    def get(self, request, hospital_id):
        log = DataIngestionLog.objects.filter(hospital_id=hospital_id).order_by('-received_at').first()
        if not log:
            return Response({
                "success": True,
                "data": None
            }, status=status.HTTP_200_OK)

        serializer = DataIngestionLogSerializer(log)
        return Response({
            "success": True,
            "data": serializer.data
        }, status=status.HTTP_200_OK)


class AlertListView(APIView):
    """
    GET /api/alerts/ - Filter and list alerts.
    """
    @extend_schema(summary="List alerts")
    def get(self, request):
        # Automatically purge/delete alerts older than 20 days
        cutoff_date = timezone.now() - datetime.timedelta(days=20)
        Alert.objects.filter(detected_at__lt=cutoff_date).delete()

        queryset = Alert.objects.all()

        hospital_id = request.query_params.get('hospital_id')
        if hospital_id:
            queryset = queryset.filter(hospital_id=hospital_id)

        severity = request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity__iexact=severity)

        status_param = request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status__iexact=status_param)

        alert_type = request.query_params.get('alert_type')
        if alert_type:
            queryset = queryset.filter(alert_type=alert_type)

        items, pagination = paginate_queryset(queryset, request)
        serializer = AlertSerializer(items, many=True)

        return Response({
            "success": True,
            "data": serializer.data,
            "pagination": pagination
        }, status=status.HTTP_200_OK)


class AlertDetailView(APIView):
    """
    GET /api/alerts/<id>/ - Get single alert.
    PATCH /api/alerts/<id>/ - Update alert status (ACTIVE, ACKNOWLEDGED, RESOLVED).
    """
    @extend_schema(summary="Get alert details")
    def get(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk)
        except Alert.DoesNotExist:
            return Response({
                "success": False,
                "error": {
                    "code": "ALERT_NOT_FOUND",
                    "message": f"Alert {pk} was not found."
                }
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = AlertSerializer(alert)
        return Response({
            "success": True,
            "data": serializer.data
        }, status=status.HTTP_200_OK)

    @extend_schema(summary="Update alert status")
    def patch(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk)
        except Alert.DoesNotExist:
            return Response({
                "success": False,
                "error": {
                    "code": "ALERT_NOT_FOUND",
                    "message": f"Alert {pk} was not found."
                }
            }, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status and new_status.upper() in ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']:
            alert.status = new_status.upper()
            if new_status.upper() == 'ACKNOWLEDGED':
                alert.is_read = True
            alert.save()
            serializer = AlertSerializer(alert)
            return Response({
                "success": True,
                "data": serializer.data
            }, status=status.HTTP_200_OK)

        return Response({
            "success": False,
            "error": {
                "code": "INVALID_STATUS",
                "message": f"Allowed statuses are: ACTIVE, ACKNOWLEDGED, RESOLVED"
            }
        }, status=status.HTTP_400_BAD_REQUEST)

    # Support POST /api/alerts/<id>/read/ for React frontend compatibility
    def post(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk)
            alert.is_read = True
            alert.status = 'ACKNOWLEDGED'
            alert.save()
            return Response({
                "success": True,
                "data": AlertSerializer(alert).data
            }, status=status.HTTP_200_OK)
        except Alert.DoesNotExist:
            return Response({
                "success": False,
                "error": {
                    "code": "ALERT_NOT_FOUND",
                    "message": f"Alert {pk} was not found."
                }
            }, status=status.HTTP_404_NOT_FOUND)


class AlertAcknowledgeView(APIView):
    """
    POST /api/alerts/acknowledge/ - Record server-side alert acknowledgment.
    GET /api/alerts/acknowledged/ - Return list of all server-acknowledged alert IDs.
    """
    @extend_schema(summary="Get acknowledged alert IDs")
    def get(self, request):
        try:
            LiveAlert.purge_expired()
            ack_ids = list(
                LiveAlert.objects.filter(is_acknowledged=True).values_list('alert_key', flat=True)
            )
        except Exception:
            logger.exception("Could not read acknowledged alerts from the alerts database")
            return Response({
                "success": False,
                "error": {"code": "ALERT_STORE_UNAVAILABLE", "message": "Alert store is unavailable."}
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({
            "success": True,
            "acknowledged_ids": ack_ids
        }, status=status.HTTP_200_OK)

    @extend_schema(summary="Acknowledge alerts globally")
    def post(self, request):
        """
        Body (all optional, combinable):
          alert_id / alert_ids: IDs to acknowledge.
          hospital_code:        applied to alert_id when no details are given.
          alerts:               [{id, hospital_code, hospital_name, severity, title,
                                  message, category, time, insert_sql, update_sql,
                                  general_sql}] - stored so the alert detail is kept
                                  for 20 days.
        """
        alert_id = request.data.get('alert_id')
        alert_ids = request.data.get('alert_ids', [])
        hospital_code = request.data.get('hospital_code') or ''
        details = request.data.get('alerts', [])

        # id -> details dict (may be empty)
        to_ack = {}
        if alert_id:
            to_ack[str(alert_id).strip()] = {'hospital_code': hospital_code}
        if isinstance(alert_ids, list):
            for i in alert_ids:
                if i:
                    to_ack.setdefault(str(i).strip(), {})
        if isinstance(details, list):
            for d in details:
                if isinstance(d, dict) and d.get('id'):
                    to_ack[str(d['id']).strip()] = d

        try:
            LiveAlert.purge_expired()
            now = timezone.now()
            for aid, d in to_ack.items():
                if not aid:
                    continue
                severity = str(d.get('severity') or 'CRITICAL').upper()
                if severity not in ('INFO', 'WARNING', 'CRITICAL'):
                    severity = 'CRITICAL'
                obj, _created = LiveAlert.objects.get_or_create(
                    alert_key=aid[:255],
                    defaults={
                        'hospital_code': str(d.get('hospital_code') or '')[:50],
                        'hospital_name': str(d.get('hospital_name') or '')[:255],
                        'severity': severity,
                        'title': str(d.get('title') or '')[:255],
                        'message': str(d.get('message') or ''),
                        'category': str(d.get('category') or '')[:100],
                        'error_time': parse_sync_timestamp(d.get('time')),
                        'insert_sql': d.get('insert_sql') or None,
                        'update_sql': d.get('update_sql') or None,
                        'general_sql': d.get('general_sql') or None,
                    },
                )
                if not obj.is_acknowledged:
                    obj.is_acknowledged = True
                    obj.acknowledged_at = now
                    obj.save(update_fields=['is_acknowledged', 'acknowledged_at', 'last_seen_at'])

                # Backend-generated DB alerts use numeric primary keys.
                if aid.isdigit():
                    Alert.objects.filter(pk=int(aid)).update(status='ACKNOWLEDGED')
        except Exception:
            logger.exception("Could not save alert acknowledgment to the alerts database")
            return Response({
                "success": False,
                "error": {"code": "ALERT_STORE_UNAVAILABLE", "message": "Could not save acknowledgment."}
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({
            "success": True,
            "acknowledged_count": len(to_ack)
        }, status=status.HTTP_200_OK)


class DashboardView(APIView):
    """
    GET /api/dashboard/ - Dashboard summary statistics using real DB data.
    """
    @extend_schema(summary="Get executive monitoring dashboard summary")
    def get(self, request):
        hospitals = Hospital.objects.all()
        total_hospitals = hospitals.count()

        statuses = [calculate_hospital_status(h)['status'] for h in hospitals]
        healthy_count = statuses.count('HEALTHY')
        delayed_count = statuses.count('DELAYED')
        warning_count = statuses.count('WARNING')
        critical_count = statuses.count('CRITICAL')
        offline_count = statuses.count('OFFLINE')
        active_hospitals = healthy_count + delayed_count + warning_count

        total_encounters = Encounter.objects.count()
        total_discharges = Discharge.objects.count()
        active_alerts_qs = Alert.objects.filter(status='ACTIVE').order_by('-detected_at')
        active_alerts = active_alerts_qs.count()

        ingestion_agg = DataIngestionLog.objects.aggregate(
            total_vol=Sum('data_size_mb'),
            avg_resp=Avg('response_time_ms')
        )
        total_vol_mb = round(ingestion_agg['total_vol'] or 0.0, 2)
        avg_resp_ms = int(ingestion_agg['avg_resp'] or 0)

        latest_log_obj = DataIngestionLog.objects.order_by('-received_at').first()
        latest_ingestion = None
        if latest_log_obj:
            latest_ingestion = DataIngestionLogSerializer(latest_log_obj).data

        recent_alerts_data = AlertSerializer(active_alerts_qs[:5], many=True).data

        # Generate real hourly volume trend from last 24 ingestion logs
        recent_logs = DataIngestionLog.objects.order_by('received_at')[:24]
        hourly_volume_trend = []
        for log in recent_logs:
            time_label = (log.received_at or log.created_at).strftime('%H:%M') if (log.received_at or log.created_at) else ''
            hourly_volume_trend.append({
                'time': time_label,
                'volumeMB': log.data_size_mb or 0.0,
                'frequencyScore': 100 if log.status == 'SUCCESS' else 50,
                'avgDelayMin': max(0, int((log.response_time_ms or 0) / 1000 / 60)) if log.response_time_ms else 0,
                'dataQuality': 100 if log.status == 'SUCCESS' else 80
            })

        return Response({
            "success": True,
            "data": {
                "total_hospitals": total_hospitals,
                "active_hospitals": active_hospitals,
                "healthy": healthy_count,
                "delayed": delayed_count,
                "warning": warning_count,
                "critical": critical_count,
                "offline": offline_count,
                "total_encounters": total_encounters,
                "total_discharges": total_discharges,
                "active_alerts": active_alerts,
                "total_data_volume_mb": total_vol_mb,
                "average_response_time_ms": avg_resp_ms,
                "latest_ingestion": latest_ingestion,
                "recent_alerts": recent_alerts_data,
                "hourly_volume_trend": hourly_volume_trend
            }
        }, status=status.HTTP_200_OK)


class AnalyticsView(APIView):
    """
    GET /api/analytics/ or GET /api/analytics/<hospital_id>/ - Real database analytics trends.
    """
    @extend_schema(summary="Get system or hospital analytics trends")
    def get(self, request, hospital_id=None):
        logs_qs = DataIngestionLog.objects.all()
        if hospital_id:
            logs_qs = logs_qs.filter(hospital_id=hospital_id)

        recent_logs = logs_qs.order_by('received_at')[:24]
        hourly_series = []

        for log in recent_logs:
            time_str = (log.received_at or log.created_at).strftime('%H:%M') if (log.received_at or log.created_at) else ''
            hourly_series.append({
                'time': time_str,
                'volumeMB': log.data_size_mb or 0.0,
                'frequencyScore': 100 if log.status == 'SUCCESS' else 50,
                'avgDelayMin': max(0, int((log.response_time_ms or 0) / 1000 / 60)) if log.response_time_ms else 0,
                'dataQuality': 100 if log.status == 'SUCCESS' else 80
            })

        return Response({
            "success": True,
            "data": {
                "hourly": hourly_series,
                "ingestion_trend": hourly_series,
                "encounters_count": Encounter.objects.filter(hospital_id=hospital_id).count() if hospital_id else Encounter.objects.count(),
                "discharges_count": Discharge.objects.filter(hospital_id=hospital_id).count() if hospital_id else Discharge.objects.count(),
                "active_alerts_count": Alert.objects.filter(hospital_id=hospital_id, status='ACTIVE').count() if hospital_id else Alert.objects.filter(status='ACTIVE').count()
            }
        }, status=status.HTTP_200_OK)


def compute_hospital_health_trend(h_logs, hospital_id):
    """
    Computes proactive integration health points & anomaly markers for a hospital.
    Baseline metrics are computed dynamically from recent hospital ingestion logs.
    """
    if not h_logs.exists():
        return []

    agg = h_logs.aggregate(
        avg_resp=Avg('response_time_ms'),
        avg_recs=Avg('record_count'),
        avg_vol=Avg('data_size_mb')
    )
    baseline_resp = agg['avg_resp'] or 150.0
    baseline_recs = agg['avg_recs'] or 10.0

    health_trend = []
    for log_item in h_logs:
        if not log_item.received_at:
            continue

        rec_time = make_aware_if_needed(log_item.received_at)
        issues = []
        status_str = 'NORMAL'
        health_score = 100

        resp_time = log_item.response_time_ms or 0
        recs = log_item.record_count or 0
        vol = log_item.data_size_mb or 0.0

        # 1. Connection / Ingestion Failure Detection
        if log_item.error_message or (log_item.status and log_item.status.upper() in ['FAILED', 'ERROR']):
            status_str = 'CRITICAL'
            health_score = 0
            msg = log_item.error_message or f"Ingestion connection failed with status {log_item.status}"
            issues.append({
                "type": "CONNECTION",
                "severity": "CRITICAL",
                "value": log_item.status,
                "baseline": "SUCCESS",
                "message": msg
            })
            Alert.objects.get_or_create(
                hospital_id=hospital_id,
                alert_type='INGESTION_FAILURE',
                severity='CRITICAL',
                status='ACTIVE',
                defaults={
                    'message': f"Critical ingestion failure at {hospital_id}: {msg}",
                    'detected_at': timezone.now()
                }
            )

        # 2. Latency Anomaly Detection
        if resp_time > max(500, baseline_resp * 2.5):
            sev = 'CRITICAL' if resp_time > 1000 or resp_time > baseline_resp * 4 else 'WARNING'
            if status_str != 'CRITICAL':
                status_str = sev
                health_score = 0 if sev == 'CRITICAL' else 50
            pct = int(((resp_time - baseline_resp) / max(1.0, baseline_resp)) * 100)
            issues.append({
                "type": "LATENCY",
                "severity": sev,
                "value": f"{resp_time} ms",
                "baseline": f"{int(baseline_resp)} ms",
                "deviation": f"+{pct}%",
                "message": f"Response latency ({resp_time} ms) is significantly above recent baseline ({int(baseline_resp)} ms)."
            })
            if sev == 'CRITICAL':
                Alert.objects.get_or_create(
                    hospital_id=hospital_id,
                    alert_type='HIGH_LATENCY',
                    severity='CRITICAL',
                    status='ACTIVE',
                    defaults={
                        'message': f"Critical latency spike at {hospital_id}: {resp_time}ms (baseline {int(baseline_resp)}ms)",
                        'detected_at': timezone.now()
                    }
                )

        # 3. Volume Anomaly Detection
        if baseline_recs >= 5 and recs < baseline_recs * 0.2:
            if status_str == 'NORMAL':
                status_str = 'WARNING'
                health_score = 50
            issues.append({
                "type": "VOLUME",
                "severity": "WARNING",
                "value": f"{recs} records",
                "baseline": f"{int(baseline_recs)} records",
                "message": f"Record count ({recs}) dropped significantly below baseline average ({int(baseline_recs)})."
            })
        elif baseline_recs >= 5 and recs > baseline_recs * 3.5:
            if status_str == 'NORMAL':
                status_str = 'WARNING'
                health_score = 50
            issues.append({
                "type": "VOLUME",
                "severity": "WARNING",
                "value": f"{recs} records",
                "baseline": f"{int(baseline_recs)} records",
                "message": f"Volume spike detected: {recs} records vs baseline average ({int(baseline_recs)})."
            })

        health_trend.append({
            "timestamp": rec_time.isoformat(),
            "time_label": rec_time.strftime('%H:%M'),
            "status": status_str,
            "health_score": health_score,
            "response_time_ms": resp_time,
            "record_count": recs,
            "data_size_mb": vol,
            "issues": issues
        })

    return health_trend


from .live_sync_service import get_live_integration_health


class IntegrationHealthView(APIView):
    """
    GET /api/ingestion/health/ - 100% Live External API Integration Health summary & hospital ingestion matrix.
    Supports query parameters: start_date, end_date (YYYY-MM-DD), hospital_id, data_structure, service_name, status, search.
    """
    @extend_schema(summary="Get live integration health summary & hospital ingestion metrics from GetDataSyncDetails")
    def get(self, request):
        filters = {
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_structure': request.query_params.get('data_structure') or request.query_params.get('data_type'),
            'service_name': request.query_params.get('service_name'),
            'status': request.query_params.get('status'),
            'search': request.query_params.get('search'),
        }

        result = get_live_integration_health(filters)
        return Response(result, status=status.HTTP_200_OK)


class IntegrationTrendView(APIView):
    """
    GET /api/ingestion/trend/ - Ingestion historical trend time series points.
    Supports filters: hospital_id, data_type, status, start_date, end_date.
    """
    @extend_schema(summary="Get ingestion historical trend time series points")
    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        hospital_id_param = request.query_params.get('hospital_id')
        data_type_param = request.query_params.get('data_type')
        status_param = request.query_params.get('status')

        logs_qs = DataIngestionLog.objects.all().order_by('received_at')
        if start_date:
            logs_qs = logs_qs.filter(received_at__date__gte=start_date)
        if end_date:
            logs_qs = logs_qs.filter(received_at__date__lte=end_date)
        if hospital_id_param and hospital_id_param != 'ALL':
            logs_qs = logs_qs.filter(hospital_id=hospital_id_param)
        if data_type_param and data_type_param != 'ALL':
            logs_qs = logs_qs.filter(data_type__iexact=data_type_param)
        if status_param and status_param != 'ALL':
            logs_qs = logs_qs.filter(status__iexact=status_param)

        hospitals = Hospital.objects.all().order_by('hospital_id')
        if hospital_id_param and hospital_id_param != 'ALL':
            hospitals = hospitals.filter(hospital_id=hospital_id_param)

        result_data = []
        for h in hospitals:
            h_logs = logs_qs.filter(hospital_id=h.hospital_id).order_by('received_at')
            points = []
            for item in h_logs:
                if item.received_at:
                    rec_time = make_aware_if_needed(item.received_at)
                    points.append({
                        "timestamp": rec_time.isoformat(),
                        "time_label": rec_time.strftime('%H:%M'),
                        "record_count": item.record_count or 0,
                        "data_size_mb": item.data_size_mb or 0.0,
                        "response_time_ms": item.response_time_ms or 0
                    })
            result_data.append({
                "hospital_id": h.hospital_id,
                "hospital_name": h.display_name,
                "points": points
            })

        return Response({
            "success": True,
            "data": result_data
        }, status=status.HTTP_200_OK)


class IntegrationHealthTrendView(APIView):
    """
    GET /api/ingestion/health-trend/ - Proactive integration health anomaly trend time series.
    Supports query parameters: hospital_id, data_type, status, start_date, end_date, severity, issue_type.
    """
    @extend_schema(summary="Get proactive integration health anomaly trend time series")
    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        hospital_id_param = request.query_params.get('hospital_id')
        data_type_param = request.query_params.get('data_type')
        status_param = request.query_params.get('status')
        severity_param = request.query_params.get('severity')
        issue_type_param = request.query_params.get('issue_type')

        logs_qs = DataIngestionLog.objects.all().order_by('received_at')
        if start_date:
            logs_qs = logs_qs.filter(received_at__date__gte=start_date)
        if end_date:
            logs_qs = logs_qs.filter(received_at__date__lte=end_date)
        if hospital_id_param and hospital_id_param != 'ALL':
            logs_qs = logs_qs.filter(hospital_id=hospital_id_param)
        if data_type_param and data_type_param != 'ALL':
            logs_qs = logs_qs.filter(data_type__iexact=data_type_param)
        if status_param and status_param != 'ALL':
            logs_qs = logs_qs.filter(status__iexact=status_param)

        hospitals = Hospital.objects.all().order_by('hospital_id')
        if hospital_id_param and hospital_id_param != 'ALL':
            hospitals = hospitals.filter(hospital_id=hospital_id_param)

        result_data = []
        for h in hospitals:
            h_logs = logs_qs.filter(hospital_id=h.hospital_id).order_by('received_at')
            trend = compute_hospital_health_trend(h_logs, h.hospital_id)

            if severity_param and severity_param != 'ALL':
                trend = [pt for pt in trend if pt['status'] == severity_param]
            if issue_type_param and issue_type_param != 'ALL':
                trend = [pt for pt in trend if any(iss['type'] == issue_type_param for iss in pt['issues'])]

            result_data.append({
                "hospital_id": h.hospital_id,
                "hospital_name": h.display_name,
                "points": trend
            })

        return Response({
            "success": True,
            "data": result_data
        }, status=status.HTTP_200_OK)


class ReportsOverviewView(APIView):
    """
    GET /api/reports/ - List report cards with real database record counts and metadata.
    """
    @extend_schema(summary="Get report cards overview and record counts")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        reports = report_services.get_reports_overview(filters)
        return Response({
            "success": True,
            "data": reports
        }, status=status.HTTP_200_OK)


class ReportDataSummaryView(APIView):
    """
    GET /api/reports/summary/ - Detailed Data Summary report dataset.
    """
    @extend_schema(summary="Get Data Summary Report")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        data = report_services.get_data_summary_report(filters)
        return Response({
            "success": True,
            "data": data
        }, status=status.HTTP_200_OK)


class ReportDelayView(APIView):
    """
    GET /api/reports/delay/ - Transmission delay & lag report dataset sorted by highest delay first.
    """
    @extend_schema(summary="Get Delay & Lag Audit Report")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        data = report_services.get_delay_report(filters)
        return Response({
            "success": True,
            "data": data
        }, status=status.HTTP_200_OK)


class ReportVolumeView(APIView):
    """
    GET /api/reports/volume/ - Data volume & payload throughput report dataset.
    """
    @extend_schema(summary="Get Data Volume & Payload Report")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        data = report_services.get_volume_report(filters)
        return Response({
            "success": True,
            "data": data
        }, status=status.HTTP_200_OK)


class ReportLatencyView(APIView):
    """
    GET /api/reports/latency/ - Latency & response time report dataset.
    """
    @extend_schema(summary="Get Latency & Response Time Report")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        data = report_services.get_latency_report(filters)
        return Response({
            "success": True,
            "data": data
        }, status=status.HTTP_200_OK)


class ReportErrorView(APIView):
    """
    GET /api/reports/errors/ - Ingestion error & failure report dataset.
    """
    @extend_schema(summary="Get Error & Failure Report")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        data = report_services.get_error_report(filters)
        return Response({
            "success": True,
            "data": data
        }, status=status.HTTP_200_OK)


class ReportIntegrationHealthView(APIView):
    """
    GET /api/reports/integration-health/ - Integration health matrix report dataset.
    """
    @extend_schema(summary="Get Integration Health Report")
    def get(self, request):
        filters = {
            'date_preset': request.query_params.get('date_preset'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'hospital_id': request.query_params.get('hospital_id'),
            'data_type': request.query_params.get('data_type'),
            'status': request.query_params.get('status'),
            'severity': request.query_params.get('severity'),
        }
        data = report_services.get_integration_health_report(filters)
        return Response({
            "success": True,
            "data": data
        }, status=status.HTTP_200_OK)

