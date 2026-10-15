/**
 * IBHAR AWS Cost & Telemetry Dashboard Controller
 * Reads from twice-daily DB snapshots / REST APIs (30m polling cycle).
 */

(function () {
    'use strict';

    const REFRESH_INTERVAL_MS = 1800000; // 30 minutes
    let refreshTimer = null;
    let sevenDayChartInstance = null;
    let serviceDonutInstance = null;
    let dailyChartInstance = null;

    const SERVICE_COLORS = [
        '#3b82f6', // EC2 - Blue
        '#6366f1', // RDS - Indigo
        '#10b981', // S3 - Emerald
        '#f59e0b', // Lambda - Amber
        '#8b5cf6', // CloudWatch - Purple
        '#ec4899', // Data Transfer - Pink
        '#06b6d4', // Cyan
        '#64748b', // Other - Slate
    ];

    document.addEventListener('DOMContentLoaded', () => {
        initCharts();
        fetchAllDashboardData();
        setupEventListeners();
        startAutoRefresh();
    });

    function setupEventListeners() {
        const btnRefresh = document.getElementById('btn-manual-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                btnRefresh.classList.add('spinning');
                fetchAllDashboardData().finally(() => {
                    setTimeout(() => btnRefresh.classList.remove('spinning'), 600);
                });
            });
        }
    }

    function startAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
            fetchAllDashboardData();
        }, REFRESH_INTERVAL_MS);
    }

    async function fetchAllDashboardData() {
        const indicator = document.getElementById('refresh-indicator');
        if (indicator) indicator.style.background = '#38bdf8';

        try {
            const [summaryRes, dailyRes, serviceRes, resourcesRes] = await Promise.all([
                fetchJSON('/aws-costs/api/summary/'),
                fetchJSON('/aws-costs/api/daily/?days=30'),
                fetchJSON('/aws-costs/api/by-service/?days=7'),
                fetchJSON('/aws-costs/api/running-services/')
            ]);

            hideStaleBanner();

            if (summaryRes) updateSummaryKPIs(summaryRes);
            if (dailyRes) {
                update7DayChart(dailyRes);
                updateDailyChart(dailyRes);
            }
            if (serviceRes) updateServiceDonut(serviceRes);
            if (resourcesRes) updateResourcesTable(resourcesRes);

            const lastUpdatedEl = document.getElementById('last-updated-text');
            if (lastUpdatedEl) {
                const timeStr = summaryRes?.last_updated || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                lastUpdatedEl.textContent = `Updated: ${timeStr}`;
            }

            if (indicator) indicator.style.background = '#10b981';
        } catch (err) {
            console.error('[AWS Dashboard] Telemetry fetch failed:', err);
            showStaleBanner('Could not refresh live AWS telemetry. Showing last known state.');
            if (indicator) indicator.style.background = '#ef4444';
        }
    }

    async function fetchJSON(url) {
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} fetching ${url}`);
        }
        return await resp.json();
    }

    function showStaleBanner(msg) {
        const banner = document.getElementById('stale-banner');
        const text = document.getElementById('stale-banner-message');
        if (banner) banner.classList.remove('hidden');
        if (text && msg) text.textContent = msg;
    }

    function hideStaleBanner() {
        const banner = document.getElementById('stale-banner');
        if (banner) banner.classList.add('hidden');
    }

    function updateSummaryKPIs(data) {
        // 1. Hourly burn (Estimate)
        const valHourly = document.getElementById('val-hourly-rate');
        if (valHourly && data.current_hourly_rate !== undefined) {
            valHourly.textContent = Number(data.current_hourly_rate).toFixed(2);
        }
        const valDayEst = document.getElementById('val-hourly-day-est');
        if (valDayEst && data.current_hourly_rate !== undefined) {
            valDayEst.textContent = `$${(Number(data.current_hourly_rate) * 24).toFixed(0)}`;
        }

        // 2. Yesterday's cost
        const valYesterday = document.getElementById('val-yesterday-cost') || document.getElementById('val-today-cost');
        if (valYesterday) {
            const cost = data.yesterday_cost !== undefined ? data.yesterday_cost : data.today_cost;
            valYesterday.textContent = Number(cost || 0).toFixed(2);
        }

        // 3. MTD and budget
        const valMtd = document.getElementById('val-mtd-cost');
        if (valMtd && data.mtd_cost !== undefined) {
            valMtd.textContent = Number(data.mtd_cost).toFixed(2);
        }
        const valBudgetLimit = document.getElementById('val-budget-limit');
        if (valBudgetLimit && data.budget_limit !== undefined) {
            valBudgetLimit.textContent = Number(data.budget_limit).toFixed(0);
        }
        const valBudgetPct = document.getElementById('val-budget-pct');
        const fillBar = document.getElementById('budget-progress-fill');
        if (data.budget_used_percent !== undefined) {
            const pct = Math.min(100, Math.max(0, Number(data.budget_used_percent)));
            if (valBudgetPct) valBudgetPct.textContent = `${pct}%`;
            if (fillBar) {
                fillBar.style.width = `${pct}%`;
                if (pct > 85) {
                    fillBar.classList.add('warning');
                } else {
                    fillBar.classList.remove('warning');
                }
            }
        }

        // 4. Forecast
        const valForecast = document.getElementById('val-forecast-cost');
        if (valForecast && data.forecast_cost !== undefined) {
            valForecast.textContent = Number(data.forecast_cost).toFixed(2);
        }

        // 5. EC2 Compute Fleet Health
        const badgeHealth = document.getElementById('badge-health-status');
        const valTotal = document.getElementById('val-ec2-total');
        const valRunning = document.getElementById('val-ec2-running');
        const valHealthRate = document.getElementById('val-ec2-health-rate');
        const valRegion = document.getElementById('val-ec2-region-name');

        const health = data.integration_health_details || {};
        const status = (data.integration_health || health.status || 'healthy').toLowerCase();

        if (badgeHealth) {
            badgeHealth.textContent = status.toUpperCase();
            badgeHealth.className = `health-status-badge badge-${status}`;
        }

        if (health.metrics) {
            const total = health.metrics.total_instances ? health.metrics.total_instances.value : 3;
            const running = health.metrics.running_instances ? health.metrics.running_instances.value : total;
            if (valTotal) valTotal.textContent = `${total} Nodes`;
            if (valRunning) valRunning.textContent = `${running} / ${total}`;
            if (valHealthRate) valHealthRate.textContent = `${health.metrics.health_rate ? health.metrics.health_rate.value : '100%'} UP`;
        }

        if (valRegion) {
            valRegion.textContent = `Region: ${health.region || 'ap-south-1'}`;
        }
    }

    function initCharts() {
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

        // 7-Day Spend Area/Line Chart
        const ctx7Day = document.getElementById('chart-hourly-timeline');
        if (ctx7Day) {
            sevenDayChartInstance = new Chart(ctx7Day, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Daily Spend ($)',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 4,
                        pointBackgroundColor: '#60a5fa',
                        pointHoverRadius: 7,
                        borderWidth: 2.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            titleColor: '#f8fafc',
                            bodyColor: '#93c5fd',
                            borderColor: '#334155',
                            borderWidth: 1,
                            padding: 10,
                            callbacks: {
                                label: (context) => ` Spend: $${Number(context.parsed.y).toFixed(2)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: '#1e293b' },
                            ticks: { font: { size: 10 } }
                        },
                        y: {
                            grid: { color: '#1e293b' },
                            ticks: {
                                callback: (val) => `$${Number(val).toFixed(0)}`,
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });
        }

        // Service Donut Chart
        const ctxDonut = document.getElementById('chart-service-donut');
        if (ctxDonut) {
            serviceDonutInstance = new Chart(ctxDonut, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: SERVICE_COLORS,
                        borderColor: '#111827',
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderWidth: 1,
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: $${Number(ctx.parsed).toFixed(2)}`
                            }
                        }
                    },
                    cutout: '68%'
                }
            });
        }

        // 30-Day Daily Trend Bar Chart
        const ctxDaily = document.getElementById('chart-daily-trend');
        if (ctxDaily) {
            dailyChartInstance = new Chart(ctxDaily, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Daily Spend ($)',
                        data: [],
                        backgroundColor: 'rgba(99, 102, 241, 0.65)',
                        hoverBackgroundColor: '#818cf8',
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderWidth: 1,
                            callbacks: {
                                label: (ctx) => ` Spend: $${Number(ctx.parsed.y).toFixed(2)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { maxTicksLimit: 15, font: { size: 10 } }
                        },
                        y: {
                            grid: { color: '#1e293b' },
                            ticks: {
                                callback: (val) => `$${Number(val).toFixed(0)}`,
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });
        }
    }

    function update7DayChart(res) {
        if (!sevenDayChartInstance) return;
        const allResults = res.results || res.data?.ResultsByTime || [];
        const results = allResults.slice(-7);
        if (!results.length) return;

        const labels = [];
        const dataPoints = [];
        let sum = 0;
        let peak = 0;

        results.forEach(item => {
            const startStr = item.TimePeriod?.Start || '';
            const dt = new Date(startStr);
            const dateLabel = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
            labels.push(dateLabel);

            const amt = Number(item.Total?.UnblendedCost?.Amount || 0);
            dataPoints.push(amt);
            sum += amt;
            if (amt > peak) peak = amt;
        });

        sevenDayChartInstance.data.labels = labels;
        sevenDayChartInstance.data.datasets[0].data = dataPoints;
        sevenDayChartInstance.update();

        const statPeak = document.getElementById('stat-hourly-peak');
        if (statPeak) statPeak.textContent = `$${peak.toFixed(2)}`;
        const statTotal = document.getElementById('stat-hourly-avg');
        if (statTotal) statTotal.textContent = `$${sum.toFixed(2)}`;
    }

    function updateServiceDonut(res) {
        const services = res.services || [];
        const container = document.getElementById('service-breakdown-list');

        if (serviceDonutInstance) {
            serviceDonutInstance.data.labels = services.map(s => s.service.replace('Amazon ', '').replace('AWS ', ''));
            serviceDonutInstance.data.datasets[0].data = services.map(s => s.amount);
            serviceDonutInstance.update();
        }

        if (container) {
            container.innerHTML = services.map((s, idx) => {
                const color = SERVICE_COLORS[idx % SERVICE_COLORS.length];
                const cleanName = s.service.replace('Amazon ', '').replace('AWS ', '');
                return `
                    <div class="service-item-row">
                        <div class="service-item-left">
                            <span class="service-color-dot" style="background: ${color};"></span>
                            <span class="service-name" title="${s.service}">${cleanName}</span>
                        </div>
                        <div class="service-item-right">
                            <span class="service-pct">${s.percentage}%</span>
                            <span class="service-amt">$${Number(s.amount).toFixed(2)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function updateDailyChart(res) {
        if (!dailyChartInstance) return;
        const results = res.results || res.data?.ResultsByTime || [];
        if (!results.length) return;

        const labels = [];
        const dataPoints = [];
        let totalSpend = 0;

        results.forEach(item => {
            const startStr = item.TimePeriod?.Start || '';
            const dt = new Date(startStr);
            labels.push(dt.toLocaleDateString([], { month: 'short', day: 'numeric' }));

            const amt = Number(item.Total?.UnblendedCost?.Amount || 0);
            dataPoints.push(amt);
            totalSpend += amt;
        });

        dailyChartInstance.data.labels = labels;
        dailyChartInstance.data.datasets[0].data = dataPoints;
        dailyChartInstance.update();

        const statTotal = document.getElementById('stat-daily-total');
        if (statTotal) statTotal.textContent = `$${totalSpend.toFixed(2)}`;
    }

    function updateResourcesTable(res) {
        const resources = res.resources || [];
        const tbody = document.getElementById('running-resources-tbody');
        const countEl = document.getElementById('resource-count-num');

        if (countEl) countEl.textContent = resources.length;
        if (!tbody) return;

        if (!resources.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No active resources found.</td></tr>';
            return;
        }

        tbody.innerHTML = resources.map(r => `
            <tr>
                <td><span class="res-type-pill">${r.type}</span></td>
                <td class="res-id-cell" title="${r.id}">${r.name || r.id}</td>
                <td>${r.region}</td>
                <td>
                    <span class="res-state-pill ${r.state_color || 'green'}">
                        <span class="res-state-dot"></span>
                        ${r.state}
                    </span>
                </td>
                <td>${r.details || '—'}</td>
                <td>${r.uptime || 'Active'}</td>
            </tr>
        `).join('');
    }
})();
