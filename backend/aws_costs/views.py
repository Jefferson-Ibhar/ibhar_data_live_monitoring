from datetime import timedelta
import logging
from django.conf import settings
from django.shortcuts import render
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import AwsCostSnapshot
from .services.factory import get_provider
from .services.snapshot import get_or_create_latest_snapshot, refresh_aws_cost_snapshot

logger = logging.getLogger(__name__)


def is_real_mode() -> bool:
    mode = getattr(settings, "AWS_COST_MODE", "mock").strip().lower()
    return mode in ("real", "aws", "production")


def dashboard_page_view(request):
    """
    Renders the AWS Cost & Telemetry Dashboard HTML page.
    """
    mode = getattr(settings, "AWS_COST_MODE", "mock").lower()
    is_mock = not is_real_mode()
    context = {
        "is_mock": is_mock,
        "mode": mode,
        "region": getattr(settings, "AWS_REGION", "ap-south-1"),
        "page_title": "AWS Cost & Usage Monitoring",
    }
    return render(request, "aws_costs/dashboard.html", context)


@api_view(["GET"])
@permission_classes([AllowAny])
def hourly_cost_view(request):
    """
    DEPRECATED: GET /aws-costs/api/hourly/?hours=24
    Hourly Cost Explorer querying is deprecated to reduce CE fees.
    """
    try:
        hours = int(request.query_params.get("hours", 24))
        hours = max(1, min(hours, 336))
        
        provider = get_provider()
        data = provider.get_hourly_cost()
        
        return Response({
            "success": True,
            "hours": hours,
            "data": data,
            "results": data.get("ResultsByTime", []),
            "deprecated": True,
            "note": "Hourly polling is deprecated to eliminate AWS Cost Explorer fees. Use /api/daily/."
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in hourly_cost_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to retrieve hourly cost data.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def daily_cost_view(request):
    """
    GET /aws-costs/api/daily/?days=30
    In real mode, returns the daily trend from the latest DB snapshot (zero CE API fees).
    """
    try:
        days = int(request.query_params.get("days", 30))
        days = max(1, min(days, 365))

        if is_real_mode():
            snapshot = get_or_create_latest_snapshot()
            daily_data = snapshot.payload.get("daily", {}) if snapshot else {}
            all_results = daily_data.get("ResultsByTime", [])
            sliced_results = all_results[-days:] if len(all_results) > days else all_results

            return Response({
                "success": True,
                "days": days,
                "data": daily_data,
                "results": sliced_results,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot else None,
                "last_updated": snapshot.payload.get("last_updated") if snapshot else None,
            }, status=status.HTTP_200_OK)

        # Mock mode
        now = timezone.now().date()
        start = now - timedelta(days=days)
        provider = get_provider()
        data = provider.get_daily_cost(start=start, end=now)

        return Response({
            "success": True,
            "days": days,
            "data": data,
            "results": data.get("ResultsByTime", [])
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in daily_cost_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to retrieve daily cost trend.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def cost_by_service_view(request):
    """
    GET /aws-costs/api/by-service/?days=7
    In real mode, returns by-service aggregation from the latest DB snapshot.
    """
    try:
        days = int(request.query_params.get("days", 7))
        days = max(1, min(days, 90))

        if is_real_mode():
            snapshot = get_or_create_latest_snapshot()
            srv_data = snapshot.payload.get("by_service_7d", {}) if snapshot else {}

            return Response({
                "success": True,
                "days": days,
                **srv_data,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot else None,
                "last_updated": snapshot.payload.get("last_updated") if snapshot else None,
            }, status=status.HTTP_200_OK)

        # Mock mode
        now = timezone.now().date()
        start = now - timedelta(days=days)
        provider = get_provider()
        data = provider.get_cost_by_service(start=start, end=now)

        return Response({
            "success": True,
            "days": days,
            **data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in cost_by_service_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to retrieve cost by service.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def forecast_view(request):
    """
    GET /aws-costs/api/forecast/
    In real mode, reads forecast & budgets from the latest DB snapshot.
    """
    try:
        if is_real_mode():
            snapshot = get_or_create_latest_snapshot()
            fc_data = snapshot.payload.get("forecast", {}) if snapshot else {}

            return Response({
                "success": True,
                **fc_data,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot else None,
                "last_updated": snapshot.payload.get("last_updated") if snapshot else None,
            }, status=status.HTTP_200_OK)

        # Mock mode
        provider = get_provider()
        data = provider.get_forecast()

        return Response({
            "success": True,
            **data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in forecast_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to retrieve cost forecast and budget.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def running_services_view(request):
    """
    GET /aws-costs/api/running-services/
    In real mode, reads active EC2/Lambda inventory from snapshot.
    """
    try:
        if is_real_mode():
            snapshot = get_or_create_latest_snapshot()
            resources = snapshot.payload.get("resources", []) if snapshot else []

            return Response({
                "success": True,
                "count": len(resources),
                "resources": resources,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot else None,
                "last_updated": snapshot.payload.get("last_updated") if snapshot else None,
            }, status=status.HTTP_200_OK)

        # Mock mode
        provider = get_provider()
        resources = provider.get_running_resources()

        return Response({
            "success": True,
            "count": len(resources),
            "resources": resources
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in running_services_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to list running resources.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def integration_health_view(request):
    """
    GET /aws-costs/api/integration-health/
    In real mode, reads EC2 compute health from snapshot.
    """
    try:
        if is_real_mode():
            snapshot = get_or_create_latest_snapshot()
            health = snapshot.payload.get("health", {}) if snapshot else {}

            return Response({
                "success": True,
                **health,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot else None,
                "last_updated": snapshot.payload.get("last_updated") if snapshot else None,
            }, status=status.HTTP_200_OK)

        # Mock mode
        provider = get_provider()
        health = provider.get_integration_health()

        return Response({
            "success": True,
            **health
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in integration_health_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to retrieve compute fleet health.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def summary_view(request):
    """
    GET /aws-costs/api/summary/
    In real mode, reads summary KPIs from the latest DB snapshot.
    """
    try:
        if is_real_mode():
            snapshot = get_or_create_latest_snapshot()
            summary = snapshot.payload.get("summary", {}) if snapshot else {}

            return Response({
                "success": True,
                **summary,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot else None,
                "last_updated": snapshot.payload.get("last_updated") if snapshot else None,
            }, status=status.HTTP_200_OK)

        # Mock mode
        provider = get_provider()
        summary = provider.get_summary()

        return Response({
            "success": True,
            **summary
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error in summary_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "Failed to generate AWS cost summary.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def force_refresh_view(request):
    """
    POST /aws-costs/api/refresh/
    Forced telemetry refresh with a 12-hour cooldown to strictly protect twice-daily Cost Explorer policy.
    """
    try:
        latest_snapshot = AwsCostSnapshot.objects.filter(status="success").first()
        cooldown_window = timedelta(hours=12)
        now = timezone.now()

        if latest_snapshot and (now - latest_snapshot.fetched_at) < cooldown_window:
            elapsed_hours = (now - latest_snapshot.fetched_at).total_seconds() / 3600
            remaining_hours = 12.0 - elapsed_hours
            return Response({
                "success": False,
                "error": f"Twice-daily rate limit active. Data was refreshed {elapsed_hours:.1f}h ago. Next allowable AWS query in {remaining_hours:.1f}h.",
                "last_updated": latest_snapshot.fetched_at.isoformat(),
                "retry_after_hours": round(remaining_hours, 1)
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        new_snapshot = refresh_aws_cost_snapshot(source=f"manual_api_user_{request.user.username}", force=True)

        if new_snapshot.status == "success":
            return Response({
                "success": True,
                "message": "AWS Cost & Infrastructure snapshot successfully refreshed from AWS.",
                "fetched_at": new_snapshot.fetched_at.isoformat(),
                "summary": new_snapshot.payload.get("summary", {})
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                "success": False,
                "error": f"Failed to refresh AWS Cost snapshot: {new_snapshot.error_message}"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    except Exception as e:
        logger.error(f"Error in force_refresh_view: {e}", exc_info=True)
        return Response({
            "success": False,
            "error": "An unexpected error occurred during AWS snapshot refresh.",
            "detail": str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
