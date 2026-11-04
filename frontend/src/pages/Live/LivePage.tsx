import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMonitoring } from '../../hooks/useMonitoring';
import { getStoredThresholds } from '../../utils/monitoring';
import { Card } from '../../components/common/Card';
import { CopyButton } from '../../components/common/CopyButton';
import {
  TrendingUp,
  Clock,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  RefreshCw,
  Sparkles,
  Activity,
  CheckCircle2,
  Tv,
  Coins,
  Zap
} from 'lucide-react';
import {
  ResponsiveContainer,
  Tooltip,
  Area,
  AreaChart
} from 'recharts';
import type { IntegrationHealthLog, IntegrationTrendPoint } from '../../types';
import { apiService } from '../../services/api';

/**
 * Line Graph Sparkline Cell for Ingestion Trend - TV & Display Optimized
 */
const IngestionSparkline: React.FC<{ points: IntegrationTrendPoint[]; isCritical: boolean }> = ({
  points,
  isCritical
}) => {
  const strokeColor = isCritical ? '#EF4444' : '#3B82F6';
  const fillColor = isCritical ? '#FCA5A5' : '#93C5FD';

  return (
    <div className="w-full h-8 relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`grad-${isCritical ? 'crit' : 'norm'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fillColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={fillColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as IntegrationTrendPoint;
                return (
                  <div className="w-[160px] bg-slate-900/95 backdrop-blur-md text-white p-2 rounded-xl shadow-2xl text-[11px] font-mono border border-slate-700 pointer-events-none z-50 space-y-0.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-0.5">
                      <span className="font-bold text-slate-300">{data.time_label || 'Sync'}</span>
                      <span className={`font-black ${isCritical ? 'text-rose-400' : 'text-blue-400'}`}>
                        {data.record_count.toLocaleString()} rows
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px]">
                      {data.data_size_mb} MB • {data.response_time_ms}ms
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="record_count"
            stroke={strokeColor}
            strokeWidth={2}
            fill={`url(#grad-${isCritical ? 'crit' : 'norm'})`}
            dot={points.length === 1 ? { r: 2.5, fill: strokeColor } : false}
            activeDot={{ r: 3.5, fill: strokeColor }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const LivePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    integrationHealthData,
    manualRefresh,
    isSimulatingUpdate,
    thresholdVersion
  } = useMonitoring();

  // Page flipping states
  const [receivingDelayedPage, setReceivingDelayedPage] = useState<number>(0);
  const [criticalPage, setCriticalPage] = useState<number>(0);
  const [isAutoFlipping, setIsAutoFlipping] = useState<boolean>(true);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // AWS Cost state for Column 3
  const [awsSummary, setAwsSummary] = useState<any>(null);
  const [awsDailyData, setAwsDailyData] = useState<any[]>([]);
  const [isAwsLoading, setIsAwsLoading] = useState<boolean>(false);
  const [customBudget, setCustomBudget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ibhar_aws_monthly_budget');
      if (saved) {
        const val = parseFloat(saved);
        if (val === 2800) {
          localStorage.setItem('ibhar_aws_monthly_budget', '680');
          return 680;
        }
        return isNaN(val) ? 680 : val;
      }
      return 680;
    } catch {
      return 680;
    }
  });

  // 70s Page Auto-Swap states (between Live and AWS Costs)
  const [isPageRotating, setIsPageRotating] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ibhar_auto_page_rotate');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [pageTimeRemaining, setPageTimeRemaining] = useState<number>(70);

  const togglePageRotate = () => {
    setIsPageRotating(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ibhar_auto_page_rotate', String(next));
      } catch (e) {}
      return next;
    });
  };

  const ITEMS_PER_PAGE = 7;
  const FLIP_INTERVAL_MS = 10000;

  const kpiContainerRef = useRef<HTMLDivElement>(null);

  // By default, auto-position the page at the KPI cards so it aligns under the sticky header
  useEffect(() => {
    let timeoutId: any;
    let timeoutId2: any;
    const scrollToKpi = () => {
      if (kpiContainerRef.current) {
        const headerEl = document.querySelector('header');
        const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 72;
        const rect = kpiContainerRef.current.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetTop = rect.top + scrollTop - headerHeight - 12;

        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'instant'
        });
      }
    };

    scrollToKpi();
    const frameId = requestAnimationFrame(scrollToKpi);
    timeoutId = setTimeout(scrollToKpi, 80);
    timeoutId2 = setTimeout(scrollToKpi, 250);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
    };
  }, []);

  // Fetch AWS Cost metrics for Column 3
  const fetchAwsData = async () => {
    try {
      setIsAwsLoading(true);
      const [sum, day] = await Promise.all([
        apiService.getAwsCostSummary(),
        apiService.getAwsDailyCosts(30),
      ]);
      if (sum) setAwsSummary(sum);
      if (Array.isArray(day)) setAwsDailyData(day);
    } catch (err) {
      console.error('Failed to fetch AWS costs for LivePage:', err);
    } finally {
      setIsAwsLoading(false);
    }
  };

  useEffect(() => {
    fetchAwsData();
    const interval = setInterval(fetchAwsData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Synchronize dynamic budget settings
  useEffect(() => {
    const handleBudgetChange = () => {
      try {
        const saved = localStorage.getItem('ibhar_aws_monthly_budget');
        if (saved) {
          const val = parseFloat(saved);
          if (!isNaN(val) && val > 0) {
            setCustomBudget(val);
          }
        }
      } catch {}
    };
    window.addEventListener('aws-budget-setting-changed', handleBudgetChange);
    window.addEventListener('storage', handleBudgetChange);
    return () => {
      window.removeEventListener('aws-budget-setting-changed', handleBudgetChange);
      window.removeEventListener('storage', handleBudgetChange);
    };
  }, []);

  // Combined manual refresh for hospital telemetry & AWS costs
  const handleManualRefresh = () => {
    manualRefresh();
    fetchAwsData();
  };

  // Extract logs from integrationHealthData
  const logs: IntegrationHealthLog[] = useMemo(() => {
    return integrationHealthData?.data || [];
  }, [integrationHealthData]);

  // Safely parse date and time components (Year, Month, Day, Hour, Min, Sec) from timestamp string
  const parseDateComponents = (tsStr?: string | null): Date | null => {
    if (!tsStr || typeof tsStr !== 'string') return null;
    const clean = tsStr.trim();
    if (!clean) return null;

    // Match ISO or standard format: "2026-09-24T05:30:34" or "2026-09-24 05:30:34"
    const match = clean.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-indexed month
      const day = parseInt(match[3], 10);
      const hours = parseInt(match[4], 10);
      const minutes = parseInt(match[5], 10);
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      return new Date(year, month, day, hours, minutes, seconds);
    }

    const fallback = new Date(clean);
    return isNaN(fallback.getTime()) ? null : fallback;
  };

  // Dynamically compute delay in minutes based strictly on last received date/time vs current date/time
  const computeDelayMinutes = (receivedAt?: string | null, serverDelay?: number): number => {
    if (!receivedAt) return serverDelay ?? 0;
    try {
      const recDate = parseDateComponents(receivedAt);
      if (!recDate || isNaN(recDate.getTime())) return serverDelay ?? 0;
      const now = new Date();
      const diffMs = now.getTime() - recDate.getTime();
      return Math.max(0, Math.floor(diffMs / (1000 * 60)));
    } catch {
      return serverDelay ?? 0;
    }
  };

  // Format delay: if it exceeds 1441 minutes, format as days
  const formatDelay = (delayMinutes: number): string => {
    if (delayMinutes > 1441) {
      const days = Math.floor(delayMinutes / 1440);
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    return `${delayMinutes} min`;
  };

  // Determine status & styling based on either custom hospital thresholds or project defaults
  const getHospitalStatus = (
    delay: number,
    thresholds: { receivingMaxMinutes: number; delayedMaxMinutes: number } = { receivingMaxMinutes: 90, delayedMaxMinutes: 270 }
  ) => {
    if (delay > thresholds.delayedMaxMinutes) {
      return {
        label: 'CRITICAL',
        priority: 1, // Highest priority (Critical first)
        rowBg: 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/40',
        textColor: 'text-rose-600 dark:text-rose-400',
      };
    }
    if (delay > thresholds.receivingMaxMinutes) {
      return {
        label: 'DELAYED',
        priority: 2, // Second priority
        rowBg: 'hover:bg-amber-50/70 dark:hover:bg-amber-950/30',
        textColor: 'text-amber-600 dark:text-amber-400',
      };
    }
    return {
      label: 'RECEIVING',
      priority: 3, // Standard priority
      rowBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    };
  };

  // Helper to construct trend points for line graph
  const getSparklinePoints = (h: IntegrationHealthLog, isCrit: boolean): IntegrationTrendPoint[] => {
    if (h.trend_points && h.trend_points.length > 0) {
      return h.trend_points;
    }
    const count = h.record_count ?? h.records_processed ?? 0;
    return [
      { timestamp: '2026-09-23T12:00:00Z', time_label: '12:00', record_count: isCrit ? 0 : Math.round(count * 0.3), data_size_mb: 1.2, response_time_ms: 120 },
      { timestamp: '2026-09-23T14:00:00Z', time_label: '14:00', record_count: isCrit ? 0 : Math.round(count * 0.65), data_size_mb: 2.1, response_time_ms: 110 },
      { timestamp: '2026-09-23T16:00:00Z', time_label: '16:00', record_count: isCrit ? 0 : Math.round(count * 0.85), data_size_mb: 2.8, response_time_ms: 95 },
      { timestamp: '2026-09-23T17:30:00Z', time_label: '17:30', record_count: count, data_size_mb: 3.4, response_time_ms: 80 },
    ];
  };

  // Format timestamps without seconds: "05:30 (24 Sept)"
  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return '—';
    try {
      const dt = parseDateComponents(ts);
      if (!dt || isNaN(dt.getTime())) return ts;
      const hours = String(dt.getHours()).padStart(2, '0');
      const minutes = String(dt.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      const day = dt.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
      const month = months[dt.getMonth()];
      return `${timeStr} (${day} ${month})`;
    } catch {
      return ts;
    }
  };

  // All enriched logs with calculated status & delay
  const enrichedLogs = useMemo(() => {
    const { customThresholds, globalThresh } = getStoredThresholds();

    return logs.map(log => {
      const delay = computeDelayMinutes(log.received_at || log.start_time, log.delay_minutes);
      const hId = log.hospital_id || log.hospital_code || '';
      const hospitalThreshold = customThresholds[hId] || globalThresh;
      const statusInfo = getHospitalStatus(delay, hospitalThreshold);
      const isCrit = statusInfo.label === 'CRITICAL';
      return {
        ...log,
        calculatedDelay: delay,
        computedStatus: statusInfo,
        sparklinePoints: getSparklinePoints(log, isCrit),
      };
    });
  }, [logs, thresholdVersion]);

  // Summary counters for top KPI strip (calculated from all monitored nodes)
  const criticalCount = useMemo(() => enrichedLogs.filter(h => h.computedStatus.label === 'CRITICAL').length, [enrichedLogs]);
  const delayedCount = useMemo(() => enrichedLogs.filter(h => h.computedStatus.label === 'DELAYED').length, [enrichedLogs]);
  const receivingCount = useMemo(() => enrichedLogs.filter(h => h.computedStatus.label === 'RECEIVING').length, [enrichedLogs]);
  const totalRowsIngested = useMemo(() => enrichedLogs.reduce((acc, h) => acc + (h.record_count ?? h.records_processed ?? 0), 0), [enrichedLogs]);
  const activeGlobalThresh = useMemo(() => getStoredThresholds().globalThresh, [thresholdVersion]);

  // Column 1: Receiving & Delayed Hospitals
  const receivingDelayedHospitals = useMemo(() => {
    return enrichedLogs
      .filter(h => {
        if (selectedStatusFilter === 'RECEIVING') return h.computedStatus.label === 'RECEIVING';
        if (selectedStatusFilter === 'DELAYED') return h.computedStatus.label === 'DELAYED';
        return h.computedStatus.label === 'RECEIVING' || h.computedStatus.label === 'DELAYED';
      })
      .sort((a, b) => {
        if (a.computedStatus.priority !== b.computedStatus.priority) {
          return a.computedStatus.priority - b.computedStatus.priority;
        }
        return (b.calculatedDelay || 0) - (a.calculatedDelay || 0);
      });
  }, [enrichedLogs, selectedStatusFilter]);

  // Column 2: Critical Hospitals Separately
  const criticalHospitals = useMemo(() => {
    return enrichedLogs
      .filter(h => {
        if (selectedStatusFilter === 'DELAYED' || selectedStatusFilter === 'RECEIVING') return false;
        return h.computedStatus.label === 'CRITICAL';
      })
      .sort((a, b) => (b.calculatedDelay || 0) - (a.calculatedDelay || 0));
  }, [enrichedLogs, selectedStatusFilter]);

  // Pagination for Column 1 & Column 2
  const receivingDelayedTotalPages = Math.max(1, Math.ceil(receivingDelayedHospitals.length / ITEMS_PER_PAGE));
  const criticalTotalPages = Math.max(1, Math.ceil(criticalHospitals.length / ITEMS_PER_PAGE));

  const currentReceivingDelayedBatch = useMemo(() => {
    const start = receivingDelayedPage * ITEMS_PER_PAGE;
    return receivingDelayedHospitals.slice(start, start + ITEMS_PER_PAGE);
  }, [receivingDelayedHospitals, receivingDelayedPage]);

  const currentCriticalBatch = useMemo(() => {
    const start = criticalPage * ITEMS_PER_PAGE;
    return criticalHospitals.slice(start, start + ITEMS_PER_PAGE);
  }, [criticalHospitals, criticalPage]);

  // Auto-flip effect every 10 seconds
  useEffect(() => {
    if (!isAutoFlipping || (receivingDelayedTotalPages <= 1 && criticalTotalPages <= 1)) {
      return;
    }

    const flipTimer = setInterval(() => {
      if (receivingDelayedTotalPages > 1) {
        setReceivingDelayedPage((prev) => (prev + 1) % receivingDelayedTotalPages);
      }
      if (criticalTotalPages > 1) {
        setCriticalPage((prev) => (prev + 1) % criticalTotalPages);
      }
    }, FLIP_INTERVAL_MS);

    return () => {
      clearInterval(flipTimer);
    };
  }, [isAutoFlipping, receivingDelayedTotalPages, criticalTotalPages]);

  // Adjust pagination if out of bounds after filtering
  useEffect(() => {
    if (receivingDelayedPage >= receivingDelayedTotalPages) {
      setReceivingDelayedPage(0);
    }
  }, [receivingDelayedTotalPages, receivingDelayedPage]);

  useEffect(() => {
    if (criticalPage >= criticalTotalPages) {
      setCriticalPage(0);
    }
  }, [criticalTotalPages, criticalPage]);

  // 70-Second Page Transition Timer (Live -> AWS Costs)
  useEffect(() => {
    if (!isPageRotating) return;

    setPageTimeRemaining(70);
    const startMs = Date.now();
    const durationMs = 70000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const left = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setPageTimeRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        navigate('/aws-costs');
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPageRotating, navigate]);

  // Column 3 AWS Metrics Calculations
  const effectiveBudget = customBudget || awsSummary?.budget_limit || 680;
  const mtdCost = Number(awsSummary?.mtd_cost ?? 48.54);
  const budgetUsedPercent = Number(((mtdCost / effectiveBudget) * 100).toFixed(1));
  const forecastCost = Number(awsSummary?.forecast_cost ?? 665.82);
  const hourlyRate = Number(awsSummary?.current_hourly_rate ?? 0.81);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const { yesterdayCost, yesterdayLabel } = (() => {
    if (awsSummary?.yesterday_cost !== undefined && awsSummary?.yesterday_cost !== null && Number(awsSummary.yesterday_cost) > 0) {
      return { yesterdayCost: Number(awsSummary.yesterday_cost), yesterdayLabel: 'Yesterday' };
    }
    if (awsDailyData && awsDailyData.length > 0) {
      const todayIso = new Date().toISOString().split('T')[0];
      const pastEntries = awsDailyData.filter((d: any) => {
        const start = d.TimePeriod?.Start || '';
        return start < todayIso;
      });
      const targetEntry = pastEntries.length > 0 ? pastEntries[pastEntries.length - 1] : awsDailyData[awsDailyData.length - 1];
      const amt = Number(targetEntry?.Total?.UnblendedCost?.Amount || 0);
      const startDt = targetEntry?.TimePeriod?.Start ? new Date(targetEntry.TimePeriod.Start) : null;
      const label = startDt && !isNaN(startDt.getTime())
        ? `${monthNames[startDt.getMonth()]} ${startDt.getDate()}`
        : 'Yesterday';
      return { yesterdayCost: amt, yesterdayLabel: label };
    }
    return { yesterdayCost: Number(awsSummary?.today_cost ?? 19.35), yesterdayLabel: 'Yesterday' };
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-full space-y-2.5 px-1 sm:px-2 pb-8 -mt-1 sm:-mt-2"
    >
      {/* Top Page Header - TV Bold Design */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 px-1">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl text-slate-900 dark:text-white tracking-wide [word-spacing:0.35rem] flex items-center gap-3">
            LIVE HOSPITAL TELEMETRY STREAM
            <TrendingUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </h1>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* 70s Auto Page Rotator (Live <-> AWS Cost) */}
          <button
            onClick={togglePageRotate}
            title={isPageRotating ? "Auto-transition active: Will switch to AWS Costs after 70s. Click to pause." : "Auto-transition paused. Click to resume."}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 shadow-sm ${
              isPageRotating
                ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 ring-2 ring-indigo-400/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
            }`}
          >
            <Tv className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>
              {isPageRotating ? `AWS Costs in ${pageTimeRemaining}s` : 'Page Swap: PAUSED'}
            </span>
            {isPageRotating ? (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Pause / Resume Auto-Flip */}
          <button
            onClick={() => setIsAutoFlipping(prev => !prev)}
            title={isAutoFlipping ? "Pause 10s table row pagination" : "Resume 10s table row pagination"}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 shadow-sm ${
              isAutoFlipping
                ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800 hover:bg-blue-100'
                : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
            }`}
          >
            {isAutoFlipping ? (
              <>
                <Pause className="w-4 h-4" /> <span>Table Flip: 10s</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> <span>Table Flip: PAUSED</span>
              </>
            )}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isSimulatingUpdate || isAwsLoading}
            title="Refresh Live Telemetry Now"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-black transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isSimulatingUpdate || isAwsLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Sync API</span>
          </button>
        </div>
      </div>

      {/* KPI Status Strip - TV Bold Numbers (UNTOUCHED) */}
      <div ref={kpiContainerRef} id="live-kpi-section" className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Critical Priority Card */}
        <div
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedStatusFilter === 'CRITICAL'
              ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-500 shadow-md ring-2 ring-rose-500/20'
              : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm font-black uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              Critical (&gt;{activeGlobalThresh.delayedMaxMinutes}m)
            </span>
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-rose-600 dark:text-rose-400">
            {criticalCount}
          </div>
          <p className="text-[11px] text-slate-400 font-extrabold mt-0.5">
            Immediate Attention Required
          </p>
        </div>

        {/* Delayed Card */}
        <div
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'DELAYED' ? 'ALL' : 'DELAYED')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedStatusFilter === 'DELAYED'
              ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-500 shadow-md ring-2 ring-amber-500/20'
              : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Delayed ({activeGlobalThresh.receivingMaxMinutes + 1}–{activeGlobalThresh.delayedMaxMinutes}m)
            </span>
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-amber-600 dark:text-amber-400">
            {delayedCount}
          </div>
          <p className="text-[11px] text-slate-400 font-extrabold mt-0.5">
            Lagging Sync Window
          </p>
        </div>

        {/* Receiving Card */}
        <div
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'RECEIVING' ? 'ALL' : 'RECEIVING')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedStatusFilter === 'RECEIVING'
              ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Receiving (≤{activeGlobalThresh.receivingMaxMinutes}m)
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-emerald-600 dark:text-emerald-400">
            {receivingCount}
          </div>
          <p className="text-[11px] text-slate-400 font-extrabold mt-0.5">
            Healthy Streaming Nodes
          </p>
        </div>

        {/* Total Nodes */}
        <div
          onClick={() => setSelectedStatusFilter('ALL')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedStatusFilter === 'ALL'
              ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-500 shadow-md ring-2 ring-blue-500/20'
              : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              Total Monitored
            </span>
            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-slate-900 dark:text-white">
            {enrichedLogs.length}
          </div>
          <p className="text-[11px] text-slate-400 font-extrabold mt-0.5">
            47 Integrated Institutions
          </p>
        </div>

        {/* Processed Rows Total */}
        <div className="p-3.5 sm:p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm font-black uppercase text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              Total Ingested Rows
            </span>
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-slate-900 dark:text-white truncate">
            {totalRowsIngested.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 font-extrabold mt-0.5">
            Live Stream Batches
          </p>
        </div>
      </div>

      {/* 3-Column Section */}
      <div id="live-table-section" className="w-full -mt-1 sm:-mt-1.5">
        {/* 3 Columns Responsive Grid:
            Column 1: Hospitals Receiving & Delayed Data (5 cols on TV & Desktop)
            Column 2: Hospitals Critical Data (5 cols on TV & Desktop)
            Column 3: AWS Cost KPI Cards Stacked Vertically (2 cols on TV & Desktop)
        */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-start">
          {/* ======================================================================= */}
          {/* COLUMN 1: HOSPITALS RECEIVING & DELAYED (5 cols on TV & Desktop)        */}
          {/* ======================================================================= */}
          <div className="md:col-span-5 flex flex-col">
            <Card className="p-0 overflow-hidden border-2 border-slate-200/90 dark:border-slate-800 shadow-xl flex flex-col bg-white dark:bg-slate-900 rounded-2xl">
              {/* Header */}
              <div className="p-3 border-b-2 border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-2.5 w-2.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <h2 className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-slate-900 dark:text-white truncate">
                    Receiving & Delayed
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                      {receivingDelayedHospitals.filter(h => h.computedStatus.label === 'RECEIVING').length} Recv
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                      {receivingDelayedHospitals.filter(h => h.computedStatus.label === 'DELAYED').length} Delay
                    </span>
                  </div>
                </div>

                {/* Pagination Controls */}
                {receivingDelayedTotalPages > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setReceivingDelayedPage((prev) => (prev === 0 ? receivingDelayedTotalPages - 1 : prev - 1))}
                      className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono font-black text-slate-500 px-1">
                      {receivingDelayedPage + 1}/{receivingDelayedTotalPages}
                    </span>
                    <button
                      onClick={() => setReceivingDelayedPage((prev) => (prev + 1) % receivingDelayedTotalPages)}
                      className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                      title="Next Page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="w-full overflow-hidden">
                <table className="w-full table-fixed text-left border-collapse font-sans">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-100/95 dark:bg-slate-900/95 select-none">
                      <th className="py-2.5 px-2 w-[18%]">HCcode</th>
                      <th className="py-2.5 px-2 w-[28%]">Name</th>
                      <th className="py-2.5 px-2 w-[18%]">Last Recv</th>
                      <th className="py-2.5 px-1.5 w-[14%] text-center">Status</th>
                      <th className="py-2.5 px-1.5 w-[11%] text-right">Rows</th>
                      <th className="py-2.5 px-1.5 w-[11%] text-center">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-xs">
                    {currentReceivingDelayedBatch.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-bold text-xs">
                          No receiving or delayed hospitals matching criteria.
                        </td>
                      </tr>
                    ) : (
                      currentReceivingDelayedBatch.map((h, idx) => {
                        const isDelayed = h.computedStatus.label === 'DELAYED';
                        return (
                          <tr
                            key={`recv-del-${h.hospital_id}-${idx}`}
                            className={`transition-colors ${
                              isDelayed
                                ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50/70 dark:hover:bg-amber-950/35'
                                : 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'
                            }`}
                            style={{ perspective: 1000 }}
                          >
                            {/* 1. HCcode */}
                            <td className="py-2.5 px-2 font-mono font-black text-xs text-slate-900 dark:text-white truncate">
                              <motion.div
                                key={`rd-code-${receivingDelayedPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                <CopyButton text={h.hospital_id} />
                              </motion.div>
                            </td>

                            {/* 2. Hospital Name */}
                            <td className="py-2.5 px-2 font-black text-slate-900 dark:text-white text-xs">
                              <motion.div
                                key={`rd-name-${receivingDelayedPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                <Link
                                  to={`/hospitals/${h.hospital_id}`}
                                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block"
                                  title={h.hospital_name}
                                >
                                  {h.hospital_name}
                                </Link>
                              </motion.div>
                            </td>

                            {/* 3. Last Received */}
                            <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">
                              <motion.div
                                key={`rd-ts-${receivingDelayedPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                {formatTimestamp(h.received_at || h.start_time)}
                              </motion.div>
                            </td>

                            {/* 4. Status Badge */}
                            <td className="py-2 px-1 text-center">
                              <motion.div
                                key={`rd-status-${receivingDelayedPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                              >
                                {isDelayed ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-sm" title={`Delayed: ${formatDelay(h.calculatedDelay)}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <span>DELAY</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>RECV</span>
                                  </span>
                                )}
                              </motion.div>
                            </td>

                            {/* 5. Processed Rows */}
                            <td className="py-2.5 px-1.5 font-mono font-black text-right text-emerald-600 dark:text-emerald-400 text-xs truncate">
                              <motion.div
                                key={`rd-rows-${receivingDelayedPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                {(h.record_count ?? h.records_processed ?? 0).toLocaleString()}
                              </motion.div>
                            </td>

                            {/* 6. Ingestion Trend Sparkline */}
                            <td className="py-2 px-1 text-center align-middle">
                              <motion.div
                                key={`rd-trend-${receivingDelayedPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, scaleY: 0.2 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'center center' }}
                              >
                                <IngestionSparkline points={h.sparklinePoints} isCritical={false} />
                              </motion.div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Column 1 Footer */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/80 border-t-2 border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Total: {receivingDelayedHospitals.length} Streaming Nodes
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Healthy &amp; Lagging Streams
                </span>
              </div>
            </Card>
          </div>

          {/* ======================================================================= */}
          {/* COLUMN 2: HOSPITALS CRITICAL ONLY (5 cols on TV & Desktop)              */}
          {/* ======================================================================= */}
          <div className="md:col-span-5 flex flex-col">
            <Card className="p-0 overflow-hidden border-2 border-slate-200/90 dark:border-slate-800 shadow-xl flex flex-col bg-white dark:bg-slate-900 rounded-2xl">
              {/* Header */}
              <div className="p-3 border-b-2 border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  <h2 className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-slate-900 dark:text-white truncate">
                    Critical Attention
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      {criticalHospitals.length} Crit
                    </span>
                  </div>
                </div>

                {/* Pagination Controls with Page Pills */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setCriticalPage((prev) => (prev === 0 ? criticalTotalPages - 1 : prev - 1))}
                    className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: criticalTotalPages }).map((_, idx) => {
                      const start = idx * ITEMS_PER_PAGE + 1;
                      const end = Math.min((idx + 1) * ITEMS_PER_PAGE, criticalHospitals.length);
                      const isCurrent = criticalPage === idx;

                      if (
                        criticalTotalPages > 4 &&
                        idx !== 0 &&
                        idx !== criticalTotalPages - 1 &&
                        Math.abs(idx - criticalPage) > 1
                      ) {
                        if (idx === 1 || idx === criticalTotalPages - 2) {
                          return <span key={idx} className="text-slate-400 text-[10px] px-0.5 font-bold">..</span>;
                        }
                        return null;
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => setCriticalPage(idx)}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black transition-all cursor-pointer border ${
                            isCurrent
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                          title={`Nodes ${start}-${end}`}
                        >
                          {start}-{end}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCriticalPage((prev) => (prev + 1) % criticalTotalPages)}
                    className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="w-full overflow-hidden">
                <table className="w-full table-fixed text-left border-collapse font-sans">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-100/95 dark:bg-slate-900/95 select-none">
                      <th className="py-2.5 px-2 w-[18%]">HCcode</th>
                      <th className="py-2.5 px-2 w-[32%]">Name</th>
                      <th className="py-2.5 px-2 w-[22%]">Last Recv</th>
                      <th className="py-2.5 px-2 w-[15%] text-right">Delay</th>
                      <th className="py-2.5 px-1.5 w-[13%] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-xs">
                    {currentCriticalBatch.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-bold text-xs">
                          No critical hospitals matching criteria.
                        </td>
                      </tr>
                    ) : (
                      currentCriticalBatch.map((h, idx) => {
                        const status = h.computedStatus;
                        return (
                          <tr
                            key={`crit-${h.hospital_id}-${idx}`}
                            className={`transition-colors ${status.rowBg}`}
                            style={{ perspective: 1000 }}
                          >
                            {/* 1. HCcode */}
                            <td className="py-2.5 px-2 font-mono font-black text-xs text-slate-900 dark:text-white truncate">
                              <motion.div
                                key={`crit-code-${criticalPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                <CopyButton text={h.hospital_id} />
                              </motion.div>
                            </td>

                            {/* 2. Hospital Name */}
                            <td className="py-2.5 px-2 font-black text-slate-900 dark:text-white text-xs">
                              <motion.div
                                key={`crit-name-${criticalPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                <Link
                                  to={`/hospitals/${h.hospital_id}`}
                                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block"
                                  title={h.hospital_name}
                                >
                                  {h.hospital_name}
                                </Link>
                              </motion.div>
                            </td>

                            {/* 3. Last Received */}
                            <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">
                              <motion.div
                                key={`crit-ts-${criticalPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                {formatTimestamp(h.received_at || h.start_time)}
                              </motion.div>
                            </td>

                            {/* 4. Delay */}
                            <td className={`py-2.5 px-2 font-mono font-black text-right text-xs truncate ${status.textColor}`}>
                              <motion.div
                                key={`crit-delay-${criticalPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, rotateX: -90, y: -4 }}
                                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                {formatDelay(h.calculatedDelay)}
                              </motion.div>
                            </td>

                            {/* 5. Status Badge */}
                            <td className="py-2 px-1 text-center">
                              <motion.div
                                key={`crit-status-${criticalPage}-${h.hospital_id}`}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.36, delay: idx * 0.05 }}
                                style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                              >
                                <motion.span
                                  animate={{
                                    scale: [1, 1.05, 1],
                                    boxShadow: [
                                      '0 0 0 0 rgba(239, 68, 68, 0.45)',
                                      '0 0 0 4px rgba(239, 68, 68, 0)',
                                      '0 0 0 0 rgba(239, 68, 68, 0.45)'
                                    ]
                                  }}
                                  transition={{
                                    duration: 1.4,
                                    repeat: Infinity,
                                    ease: 'easeInOut'
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-sm border border-rose-300"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                  <span>CRIT</span>
                                </motion.span>
                              </motion.div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Column 2 Footer */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/80 border-t-2 border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Total: {criticalHospitals.length} Critical Hospitals
                </span>
                <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  Critical Action Required
                </span>
              </div>
            </Card>
          </div>

          {/* ========================================================================= */}
          {/* COLUMN 3: AWS COST KPI CARDS (2 cols - TV & Desktop Side-by-Side)        */}
          {/* ========================================================================= */}
          <div className="md:col-span-2 flex flex-col gap-2 sm:gap-2.5">
            {/* Column Header: AWS COST */}
            <div className="p-2.5 sm:p-3 rounded-2xl border-2 border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shadow-sm flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="flex h-2 w-2 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <h2 className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-slate-900 dark:text-white truncate">
                  AWS COST
                </h2>
              </div>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800 shrink-0">
                LIVE
              </span>
            </div>

            {/* KPI 1: Hourly Burn (Estimate) */}
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="truncate">HOURLY BURN</span>
                <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1 my-0.5 min-w-0">
                <span className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white font-mono truncate">
                  ${hourlyRate.toFixed(2)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">/hr</span>
              </div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                Est. ${(hourlyRate * 24).toFixed(0)}/day
              </p>
            </div>

            {/* KPI 2: Yesterday's Spend */}
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="truncate">YESTERDAY</span>
                <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1 my-0.5 min-w-0">
                <span className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white font-mono truncate">
                  ${yesterdayCost.toFixed(2)}
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                {yesterdayLabel ? `${yesterdayLabel} finalized` : 'Finalized spend'}
              </p>
            </div>

            {/* KPI 3: Month-to-Date */}
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="truncate">MTD SPEND</span>
                <button
                  onClick={() => navigate('/notification-settings')}
                  title="Configure Dynamic Monthly Budget in Settings"
                  className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-500 transition-colors cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-baseline gap-1 my-0.5 min-w-0">
                <span className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white font-mono truncate">
                  ${mtdCost.toFixed(2)}
                </span>
              </div>
              <div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetUsedPercent > 100
                        ? 'bg-rose-500'
                        : budgetUsedPercent > 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, budgetUsedPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {budgetUsedPercent}% of ${effectiveBudget.toLocaleString()}
                  </p>
                  <button
                    onClick={() => navigate('/notification-settings')}
                    className="text-[9px] font-bold text-indigo-500 hover:text-indigo-600 underline cursor-pointer shrink-0"
                    title="Edit dynamic monthly budget in settings"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>

            {/* KPI 4: Forecast */}
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="truncate">FORECAST</span>
                <TrendingUp className={`w-3.5 h-3.5 shrink-0 ${forecastCost > effectiveBudget ? 'text-rose-500' : 'text-purple-500'}`} />
              </div>
              <div className="flex items-baseline gap-1 my-0.5 min-w-0">
                <span className={`text-lg sm:text-xl lg:text-2xl font-black font-mono truncate ${forecastCost > effectiveBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                  ${forecastCost.toFixed(2)}
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                Target: &lt; ${effectiveBudget.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
