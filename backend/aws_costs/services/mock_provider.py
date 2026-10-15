import calendar
from datetime import datetime, timedelta
import math
import random
from typing import Any, Dict, List, Optional
from django.utils import timezone

from .base import CostProvider

SERVICES = [
    "Amazon Elastic Compute Cloud - Compute",
    "Amazon Relational Database Service",
    "Amazon Simple Storage Service",
    "AWS Lambda",
    "AmazonCloudWatch",
    "AWS Data Transfer",
]

SERVICE_WEIGHTS = {
    "Amazon Elastic Compute Cloud - Compute": 0.42,
    "Amazon Relational Database Service": 0.35,
    "Amazon Simple Storage Service": 0.08,
    "AWS Lambda": 0.05,
    "AmazonCloudWatch": 0.06,
    "AWS Data Transfer": 0.04,
}


class MockCostProvider(CostProvider):
    """
    Mock implementation returning stable, realistic fake data adhering EXACTLY
    to AWS Cost Explorer, Budgets, and CloudWatch response formats.
    """

    def __init__(self, seed: int = 42):
        self.seed = seed

    def _get_hourly_base_cost(self, dt: datetime) -> float:
        """
        Generates realistic diurnal hourly curve (higher costs during peak business hours).
        Stable based on day and hour.
        """
        hour = dt.hour
        cycle = math.sin((hour - 6) / 24.0 * 2 * math.pi)
        base = 2.40 + max(0.0, cycle) * 1.80

        rng = random.Random(int(dt.timestamp()) // 3600 + self.seed)
        jitter = rng.uniform(-0.15, 0.25)
        
        if dt.day % 3 == 0 and hour in (14, 15):
            jitter += rng.uniform(0.8, 1.6)

        return max(0.50, round(base + jitter, 4))

    def get_hourly_cost(self, start: Optional[datetime] = None, end: Optional[datetime] = None) -> Dict[str, Any]:
        """
        DEPRECATED: Matches AWS Cost Explorer GetCostAndUsage response with Granularity='HOURLY'.
        Retained for backwards compatibility.
        """
        now = end or timezone.now().replace(minute=0, second=0, microsecond=0)
        start_time = start or (now - timedelta(hours=24))

        results_by_time = []
        curr = start_time
        while curr < now:
            nxt = curr + timedelta(hours=1)
            total_amount = self._get_hourly_base_cost(curr)

            groups = []
            for service, weight in SERVICE_WEIGHTS.items():
                rng = random.Random(int(curr.timestamp()) + hash(service))
                srv_jitter = rng.uniform(0.92, 1.08)
                srv_cost = round(total_amount * weight * srv_jitter, 4)
                groups.append({
                    "Keys": [service],
                    "Metrics": {
                        "UnblendedCost": {
                            "Amount": f"{srv_cost:.4f}",
                            "Unit": "USD"
                        }
                    }
                })

            results_by_time.append({
                "TimePeriod": {
                    "Start": curr.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "End": nxt.strftime("%Y-%m-%dT%H:%M:%SZ")
                },
                "Total": {
                    "UnblendedCost": {
                        "Amount": f"{total_amount:.4f}",
                        "Unit": "USD"
                    }
                },
                "Groups": groups,
                "Estimated": curr > (now - timedelta(hours=4))
            })
            curr = nxt

        return {
            "DimensionKeyMetrics": [],
            "GroupDefinitions": [{"Type": "DIMENSION", "Key": "SERVICE"}],
            "ResultsByTime": results_by_time,
            "ResponseMetadata": {"HTTPStatusCode": 200, "RetryAttempts": 0}
        }

    def get_daily_cost(self, start: Optional[datetime] = None, end: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Matches AWS Cost Explorer GetCostAndUsage response with Granularity='DAILY'.
        """
        now = end or timezone.now().date()
        if isinstance(now, datetime):
            now = now.date()
        start_date = start or (now - timedelta(days=30))
        if isinstance(start_date, datetime):
            start_date = start_date.date()

        results_by_time = []
        curr = start_date
        while curr <= now:
            nxt = curr + timedelta(days=1)
            weekday_mult = 1.15 if curr.weekday() < 5 else 0.85
            rng = random.Random(curr.toordinal() + self.seed)
            day_total = (78.0 + rng.uniform(-6.0, 12.0)) * weekday_mult
            
            if curr == (now - timedelta(days=5)):
                day_total += 35.50

            day_total = round(day_total, 2)

            groups = []
            for service, weight in SERVICE_WEIGHTS.items():
                srv_jitter = rng.uniform(0.95, 1.05)
                srv_cost = round(day_total * weight * srv_jitter, 2)
                groups.append({
                    "Keys": [service],
                    "Metrics": {
                        "UnblendedCost": {
                            "Amount": f"{srv_cost:.2f}",
                            "Unit": "USD"
                        }
                    }
                })

            results_by_time.append({
                "TimePeriod": {
                    "Start": curr.strftime("%Y-%m-%d"),
                    "End": nxt.strftime("%Y-%m-%d")
                },
                "Total": {
                    "UnblendedCost": {
                        "Amount": f"{day_total:.2f}",
                        "Unit": "USD"
                    }
                },
                "Groups": groups,
                "Estimated": curr >= (now - timedelta(days=2))
            })
            curr = nxt

        return {
            "DimensionKeyMetrics": [],
            "GroupDefinitions": [{"Type": "DIMENSION", "Key": "SERVICE"}],
            "ResultsByTime": results_by_time,
            "ResponseMetadata": {"HTTPStatusCode": 200, "RetryAttempts": 0}
        }

    def get_cost_by_service(self, start: Optional[datetime] = None, end: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Aggregates total spend by AWS service over the requested window (default past 7 days).
        Slices the cached 30-day daily result to avoid redundant invocations.
        """
        start_date = start or (timezone.now().date() - timedelta(days=7))
        if isinstance(start_date, datetime):
            start_date = start_date.date()
        start_str = start_date.strftime("%Y-%m-%d")

        daily_res = self.get_daily_cost()
        all_days = daily_res.get("ResultsByTime", [])
        sliced_days = [d for d in all_days if d.get("TimePeriod", {}).get("Start", "") >= start_str]
        if not sliced_days and all_days:
            sliced_days = all_days[-7:]
        
        service_totals: Dict[str, float] = {}
        grand_total = 0.0

        for day_entry in sliced_days:
            for group in day_entry.get("Groups", []):
                srv_name = group["Keys"][0]
                amt = float(group["Metrics"]["UnblendedCost"]["Amount"])
                service_totals[srv_name] = round(service_totals.get(srv_name, 0.0) + amt, 2)
                grand_total = round(grand_total + amt, 2)

        sorted_services = sorted(
            [{"service": k, "amount": v, "percentage": round((v / grand_total * 100) if grand_total > 0 else 0, 1)}
             for k, v in service_totals.items()],
            key=lambda x: x["amount"],
            reverse=True
        )

        return {
            "start": sliced_days[0]["TimePeriod"]["Start"] if sliced_days else "",
            "end": sliced_days[-1]["TimePeriod"]["End"] if sliced_days else "",
            "total_cost": grand_total,
            "unit": "USD",
            "services": sorted_services,
            "raw_response": daily_res
        }

    def get_forecast(self) -> Dict[str, Any]:
        """
        Matches AWS Cost Explorer GetCostForecast and Budgets DescribeBudgets structure.
        """
        now = timezone.now()
        year, month = now.year, now.month
        num_days = calendar.monthrange(year, month)[1]
        
        # MTD calculated from daily data in current month
        daily_res = self.get_daily_cost()
        current_month_prefix = now.strftime("%Y-%m")
        mtd_cost = 0.0
        for day_entry in daily_res.get("ResultsByTime", []):
            if day_entry.get("TimePeriod", {}).get("Start", "").startswith(current_month_prefix):
                try:
                    amt = float(day_entry.get("Total", {}).get("UnblendedCost", {}).get("Amount", 0.0))
                    mtd_cost += amt
                except (ValueError, TypeError):
                    pass
        
        if mtd_cost <= 0.0:
            days_passed = max(1, now.day)
            daily_avg = 82.50
            mtd_cost = round(days_passed * daily_avg + random.Random(self.seed).uniform(-10.0, 15.0), 2)

        days_passed = max(1, now.day)
        daily_rate = mtd_cost / days_passed
        projected_total = round(mtd_cost + ((num_days - days_passed) * daily_rate), 2)
        budget_limit = 2800.00
        budget_percent = round((mtd_cost / budget_limit) * 100, 1)

        return {
            "Total": {
                "Amount": f"{projected_total:.2f}",
                "Unit": "USD"
            },
            "ForecastResultsByTime": [
                {
                    "TimePeriod": {
                        "Start": now.strftime("%Y-%m-%d"),
                        "End": f"{year}-{month:02d}-{num_days:02d}"
                    },
                    "MeanValue": f"{projected_total:.2f}",
                    "PredictionIntervalLowerBound": f"{projected_total * 0.94:.2f}",
                    "PredictionIntervalUpperBound": f"{projected_total * 1.07:.2f}"
                }
            ],
            "Budget": {
                "BudgetName": "Ibhar-Production-Monthly-Budget",
                "BudgetLimit": {"Amount": f"{budget_limit:.2f}", "Unit": "USD"},
                "ActualSpend": {"Amount": f"{mtd_cost:.2f}", "Unit": "USD"},
                "ForecastedSpend": {"Amount": f"{projected_total:.2f}", "Unit": "USD"},
                "PercentageUsed": budget_percent,
                "Status": "OK" if projected_total <= budget_limit else "ALARM"
            }
        }

    def get_running_resources(self) -> List[Dict[str, Any]]:
        """
        Returns list of running AWS resources across EC2 instances and Lambda functions.
        """
        return [
            {
                "type": "EC2 Instance",
                "id": "i-09f8e7d6c5b4a3210",
                "name": "ibhar-web-api-node-01",
                "region": "ap-south-1a",
                "state": "running",
                "state_color": "green",
                "details": "t4g.xlarge | 10.142.0.12",
                "uptime": "Active"
            },
            {
                "type": "EC2 Instance",
                "id": "i-01a2b3c4d5e6f7890",
                "name": "ibhar-sync-engine-node-02",
                "region": "ap-south-1b",
                "state": "running",
                "state_color": "green",
                "details": "t4g.xlarge | 10.142.0.18",
                "uptime": "Active"
            },
            {
                "type": "EC2 Instance",
                "id": "i-04c5d6e7f8a9b0123",
                "name": "ibhar-db-compute-node-03",
                "region": "ap-south-1a",
                "state": "running",
                "state_color": "green",
                "details": "t4g.2xlarge | 10.142.0.25",
                "uptime": "Active"
            },
            {
                "type": "Lambda Function",
                "id": "arn:aws:lambda:ap-south-1:123456789012:function:ibhar-live-data-ingestor",
                "name": "ibhar-live-data-ingestor",
                "region": "ap-south-1",
                "state": "active",
                "state_color": "green",
                "details": "Python 3.12 | 1024 MB | Invocations: ~24k/hr",
                "uptime": "Active"
            },
            {
                "type": "Lambda Function",
                "id": "arn:aws:lambda:ap-south-1:123456789012:function:ibhar-alert-notifier",
                "name": "ibhar-alert-notifier",
                "region": "ap-south-1",
                "state": "active",
                "state_color": "green",
                "details": "Node.js 20.x | 512 MB | SNS / Webhook Alerts",
                "uptime": "Active"
            },
            {
                "type": "S3 Bucket",
                "id": "ibhar-telemetry-archive-ap-south-1",
                "name": "ibhar-telemetry-archive",
                "region": "ap-south-1",
                "state": "active",
                "state_color": "green",
                "details": "Standard-IA + Glacier Lifecycle | ~1.4 TB",
                "uptime": "100%"
            }
        ]

    def get_integration_health(self) -> Dict[str, Any]:
        """
        Derives compute infrastructure health based on EC2 fleet status.
        """
        return {
            "status": "healthy",
            "status_label": "HEALTHY",
            "fleet_type": "EC2 Compute Fleet",
            "region": "ap-south-1",
            "metrics": {
                "total_instances": {"value": 3, "unit": "Count", "status": "normal"},
                "running_instances": {"value": 3, "unit": "Count", "status": "normal"},
                "health_rate": {"value": "100%", "unit": "Percent", "status": "normal"},
            },
            "last_checked": timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC")
        }

    def get_summary(self) -> Dict[str, Any]:
        """
        Summarizes key financial and operational metrics without making hourly CE calls.
        Hourly burn is derived as an estimate from today's accrued spend.
        """
        daily = self.get_daily_cost()
        by_service = self.get_cost_by_service()
        forecast = self.get_forecast()
        health = self.get_integration_health()
        resources = self.get_running_resources()

        # Today's cost
        now = timezone.now()
        today_str = now.strftime("%Y-%m-%d")
        all_daily = daily.get("ResultsByTime", [])
        today_entry = next((d for d in all_daily if d["TimePeriod"]["Start"] == today_str), None)
        today_cost = float(today_entry["Total"]["UnblendedCost"]["Amount"]) if today_entry else 68.40

        # Estimated hourly rate (today_cost / elapsed hours)
        hours_elapsed = max(1.0, now.hour + (now.minute / 60.0))
        current_hourly_cost = round(today_cost / hours_elapsed, 2)
        yesterday_cost = round(today_cost * 0.94, 2)

        # Top 3 services
        top_services = by_service.get("services", [])[:3]

        return {
            "mode": "mock",
            "is_mock": True,
            "currency": "USD",
            "current_hourly_rate": round(current_hourly_cost, 2),
            "current_hourly_rate_is_estimate": True,
            "today_cost": round(today_cost, 2),
            "yesterday_cost": round(yesterday_cost, 2),
            "mtd_cost": float(forecast["Budget"]["ActualSpend"]["Amount"]),
            "forecast_cost": float(forecast["Total"]["Amount"]),
            "budget_limit": float(forecast["Budget"]["BudgetLimit"]["Amount"]),
            "budget_used_percent": float(forecast["Budget"]["PercentageUsed"]),
            "budget_status": forecast["Budget"]["Status"],
            "top_services": top_services,
            "running_resources_count": len(resources),
            "integration_health": health["status"],
            "integration_health_details": health,
            "last_updated": now.strftime("%Y-%m-%d %H:%M:%S UTC")
        }
