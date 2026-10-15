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
  Search,
  RefreshCw,
  Sparkles,
  Activity,
  CheckCircle2,
  Tv
} from 'lucide-react';
import {
  ResponsiveContainer,
  Tooltip,
  Area,
  AreaChart
} from 'recharts';
import type { IntegrationHealthLog, IntegrationTrendPoint } from '../../types';

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
    <div className="w-full h-10 relative">
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
            strokeWidth={2.5}
            fill={`url(#grad-${isCritical ? 'crit' : 'norm'})`}
            dot={points.length === 1 ? { r: 3, fill: strokeColor } : false}
            activeDot={{ r: 4, fill: strokeColor }}
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
    lastUpdated,
    manualRefresh,
    isSimulatingUpdate,
    thresholdVersion
  } = useMonitoring();

  // Page flipping states (for 4s table records pagination)
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [isAutoFlipping, setIsAutoFlipping] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [progress, setProgress] = useState<number>(0);

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
  const PROGRESS_TICK_MS = 50;

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // By default, auto-position the page at the table toolbar so it aligns under the sticky header
  useEffect(() => {
    let timeoutId: any;
    const scrollToTable = () => {
      if (tableContainerRef.current) {
        const headerEl = document.querySelector('header');
        const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 72;
        const rect = tableContainerRef.current.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetTop = rect.top + scrollTop - headerHeight - 8;

        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'instant'
        });
      }
    };

    scrollToTable();
    const frameId = requestAnimationFrame(scrollToTable);
    timeoutId = setTimeout(scrollToTable, 80);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, []);

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

  // Determine status & styling based on either custom hospital thresholds or project defaults:
  // Default: <= 30 mins: RECEIVING, 31 to 61 mins: DELAYED, > 61 mins: CRITICAL
  const getHospitalStatus = (
    delay: number,
    thresholds: { receivingMaxMinutes: number; delayedMaxMinutes: number } = { receivingMaxMinutes: 30, delayedMaxMinutes: 61 }
  ) => {
    if (delay > thresholds.delayedMaxMinutes) {
      return {
        label: 'CRITICAL',
        priority: 1, // Highest priority (Critical first)
        rowBg: 'bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/40',
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
      rowBg: 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60',
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

  const formatShortTime = (ts?: string | null) => {
    if (!ts) return '—';
    try {
      const dt = parseDateComponents(ts);
      if (dt && !isNaN(dt.getTime())) {
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      }
      if (ts.includes('T')) {
        return ts.split('T')[1].substring(0, 5);
      }
      return ts.substring(0, 5);
    } catch {
      return ts;
    }
  };

  // Sort and arrange hospitals: Critical first, then Delayed, then Receiving
  const sortedHospitals = useMemo(() => {
    const { customThresholds, globalThresh } = getStoredThresholds();

    const enriched = logs.map(log => {
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

    // Filter by search and status
    const filtered = enriched.filter(h => {
      const matchesSearch =
        searchQuery === '' ||
        h.hospital_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.hospital_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (h.data_structure && h.data_structure.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (h.service_name && h.service_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        selectedStatusFilter === 'ALL' ||
        h.computedStatus.label === selectedStatusFilter;

      return matchesSearch && matchesStatus;
    });

    // Sort: Priority 1 (Critical) -> Priority 2 (Delayed) -> Priority 3 (Receiving)
    // Within each priority group, sort by calculatedDelay descending (highest delay at top)
    return filtered.sort((a, b) => {
      if (a.computedStatus.priority !== b.computedStatus.priority) {
        return a.computedStatus.priority - b.computedStatus.priority;
      }
      return (b.calculatedDelay || 0) - (a.calculatedDelay || 0);
    });
  }, [logs, searchQuery, selectedStatusFilter, thresholdVersion]);

  const totalPages = Math.max(1, Math.ceil(sortedHospitals.length / ITEMS_PER_PAGE));

  // Auto-flip effect every 4 seconds
  useEffect(() => {
    if (!isAutoFlipping || totalPages <= 1) {
      setProgress(0);
      return;
    }

    const startTime = Date.now();

    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / FLIP_INTERVAL_MS) * 100);
      setProgress(pct);
    }, PROGRESS_TICK_MS);

    const flipTimer = setTimeout(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
      setProgress(0);
    }, FLIP_INTERVAL_MS);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(flipTimer);
    };
  }, [currentPage, isAutoFlipping, totalPages]);

  // Adjust current page if out of bounds after filtering
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(0);
    }
  }, [totalPages, currentPage]);

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

  // Slice currently displayed 10 hospitals
  const startIndex = currentPage * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, sortedHospitals.length);
  const currentBatch = sortedHospitals.slice(startIndex, endIndex);

  // Summary counters
  const criticalCount = useMemo(() => sortedHospitals.filter(h => h.computedStatus.label === 'CRITICAL').length, [sortedHospitals]);
  const delayedCount = useMemo(() => sortedHospitals.filter(h => h.computedStatus.label === 'DELAYED').length, [sortedHospitals]);
  const receivingCount = useMemo(() => sortedHospitals.filter(h => h.computedStatus.label === 'RECEIVING').length, [sortedHospitals]);
  const totalRowsIngested = useMemo(() => sortedHospitals.reduce((acc, h) => acc + (h.record_count ?? h.records_processed ?? 0), 0), [sortedHospitals]);
  const activeGlobalThresh = useMemo(() => getStoredThresholds().globalThresh, [thresholdVersion]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-full space-y-4 px-1 sm:px-2 pb-8"
    >
      {/* Top Page Header - TV Bold Design */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
              <span className="text-xs font-black uppercase text-blue-700 dark:text-blue-300 tracking-wider">
                LIVE TELEMETRY MONITORING
              </span>
            </div>
            <span className="text-xs sm:text-sm font-mono text-slate-400 font-extrabold">
              Synced: {lastUpdated}
            </span>
          </div>

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

          {/* Pause / Resume Auto-Flip (10s row table pagination) */}
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
            onClick={manualRefresh}
            disabled={isSimulatingUpdate}
            title="Refresh Live Telemetry Now"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-black transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isSimulatingUpdate ? 'animate-spin text-blue-600' : ''}`} />
            <span>Sync API</span>
          </button>
        </div>
      </div>

      {/* KPI Status Strip - TV Bold Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3">
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
            {sortedHospitals.length}
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

      {/* Main Table Container - Full Edge-to-Edge Width, Auto-positioned on mount */}
      <div ref={tableContainerRef} id="live-table-section" className="w-full">
        <Card className="p-0 overflow-hidden border-2 border-slate-200/90 dark:border-slate-800 shadow-xl w-full">
        {/* Table Top Toolbar */}
        <div className="p-3 sm:p-4 border-b-2 border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Search & Filter */}
          <div className="flex items-center flex-1 gap-3 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(0);
                }}
                placeholder="Search code, hospital name, data structure..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Right: Flip Progress & Pagination Navigation */}
          <div className="flex items-center flex-wrap justify-between sm:justify-end gap-3">
            {/* Auto-flip ticker indicator */}
            {isAutoFlipping && totalPages > 1 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-xs font-black text-slate-600 dark:text-slate-300 font-mono">
                  Next flip in {((FLIP_INTERVAL_MS * (100 - progress)) / 100000).toFixed(1)}s
                </span>
                <div className="w-16 sm:w-20 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-75 ease-linear rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((prev) => (prev === 0 ? totalPages - 1 : prev - 1))}
                className="p-2 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                title="Previous 7 Hospitals"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Pill Buttons */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const start = idx * ITEMS_PER_PAGE + 1;
                  const end = Math.min((idx + 1) * ITEMS_PER_PAGE, sortedHospitals.length);
                  const isCurrent = currentPage === idx;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentPage(idx);
                        setProgress(0);
                      }}
                      className={`px-3 py-1 rounded-xl text-xs sm:text-sm font-mono font-black transition-all cursor-pointer border-2 ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {start}-{end}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage((prev) => (prev + 1) % totalPages)}
                className="p-2 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                title="Next 7 Hospitals"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>



        {/* Full-width Responsive Table with ZERO Horizontal Scroll
            Columns are allocated exact needed space to fit 100% screen width right next to the sidebar:
            1. Hospital Code: 8%
            2. Hospital Name: 22%
            3. Last Received: 14% (Time + Date, no seconds)
            4. Delay: 7%
            5. Status: 10%
            6. Processed Rows: 8%
            7. Process Duration: 8%
            8. Data Structure: 7%
            9. Service Name: 8%
            10. Trend: 8%
        */}
        {/* Full-width Responsive Table with ZERO Horizontal Scroll
            Columns are allocated exact needed space to fit 100% screen width right next to the sidebar:
            1. Hospital Code: 8%
            2. Hospital Name: 22%
            3. Last Received: 14% (Time + Date, no seconds)
            4. Delay: 7%
            5. Status: 10%
            6. Processed Rows: 8%
            7. Process Duration: 8%
            8. Data Structure: 7%
            9. Service Name: 8%
            10. Trend: 8%
        */}
        <div className="w-full overflow-hidden rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm">
          <table className="w-full table-fixed text-left border-collapse font-sans">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-100/95 dark:bg-slate-900/95 select-none">
                {/* 1. Hospital Code */}
                <th className="py-3.5 px-2.5 w-[8%]">
                  HCcode
                </th>

                {/* 2. Hospital Name */}
                <th className="py-3.5 px-2.5 w-[22%]">
                  Name
                </th>

                {/* 3. Last Received */}
                <th className="py-3.5 px-2.5 w-[14%]">
                  Last Received
                </th>

                {/* 4. Delay */}
                <th className="py-3.5 px-2.5 w-[7%] text-right">
                  Delay
                </th>

                {/* 5. Status */}
                <th className="py-3.5 px-2.5 w-[10%] text-center">
                  Status
                </th>

                {/* 6. Processed Rows */}
                <th className="py-3.5 px-2.5 w-[8%] text-right">
                  Processed
                </th>

                {/* 7. Process Duration */}
                <th className="py-3.5 px-2.5 w-[8%] text-right">
                  Duration
                </th>

                {/* 8. Data Structure */}
                <th className="py-3.5 px-2.5 w-[7%] text-center">
                  Data Structure
                </th>

                {/* 9. Service Name */}
                <th className="py-3.5 px-2.5 w-[8%]">
                  Service
                </th>

                {/* 10. Ingestion Trend Line Graph */}
                <th className="py-3.5 px-2.5 w-[8%] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Trend</span>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {currentBatch.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 font-bold text-base">
                    No hospitals found matching current criteria.
                  </td>
                </tr>
              ) : (
                currentBatch.map((h, idx) => {
                  const status = h.computedStatus;
                  const isCrit = status.label === 'CRITICAL';
                  const isDelayed = status.label === 'DELAYED';
                  const durationStr = h.duration_seconds !== undefined ? `${h.duration_seconds}s` : `${h.response_time_ms || 0} ms`;
                  const timeRangeStr = h.start_time && h.end_time
                    ? `${formatShortTime(h.start_time)} - ${formatShortTime(h.end_time)}`
                    : '—';

                  return (
                    <tr
                      key={`slot-${idx}`}
                      className={`transition-colors ${status.rowBg}`}
                      style={{ perspective: 1000 }}
                    >
                      {/* 1. Hospital Code */}
                      <td className="py-3.5 px-2.5 font-mono font-black text-xs sm:text-sm lg:text-base text-slate-900 dark:text-white truncate">
                        <motion.div
                          key={`code-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          <CopyButton text={h.hospital_id} />
                        </motion.div>
                      </td>

                      {/* 2. Hospital Name */}
                      <td className="py-3.5 px-2.5 font-black text-slate-900 dark:text-white text-xs sm:text-sm lg:text-base">
                        <motion.div
                          key={`name-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
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

                      {/* 3. Last Received - Time and Date without Seconds or Ellipsis */}
                      <td className="py-3.5 px-2.5 font-mono text-xs sm:text-sm lg:text-base text-slate-800 dark:text-slate-100 font-extrabold whitespace-nowrap">
                        <motion.div
                          key={`ts-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          {formatTimestamp(h.received_at || h.start_time)}
                        </motion.div>
                      </td>

                      {/* 4. Delay */}
                      <td className={`py-3.5 px-2.5 font-mono font-black text-right text-xs sm:text-sm lg:text-base truncate ${status.textColor}`}>
                        <motion.div
                          key={`delay-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          {formatDelay(h.calculatedDelay)}
                        </motion.div>
                      </td>

                      {/* 5. Status with BIG POPUP ANIMATION for CRITICAL */}
                      <td className="py-3 px-2 text-center overflow-visible">
                        <motion.div
                          key={`status-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, scale: 0.9 }}
                          animate={{ opacity: 1, rotateX: 0, scale: 1 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          {isCrit ? (
                            <motion.div
                              animate={{
                                scale: [1, 1.04, 1],
                                boxShadow: [
                                  '0 0 0 0 rgba(239, 68, 68, 0.45)',
                                  '0 0 0 5px rgba(239, 68, 68, 0)',
                                  '0 0 0 0 rgba(239, 68, 68, 0.45)'
                                ]
                              }}
                              transition={{
                                duration: 1.4,
                                repeat: Infinity,
                                ease: 'easeInOut'
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider bg-rose-600 text-white shadow-md shadow-rose-600/30 border border-rose-300"
                            >
                              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                              <span>CRITICAL</span>
                            </motion.div>
                          ) : isDelayed ? (
                            <div className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-400 dark:border-amber-700 shadow-sm">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>DELAYED</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-700 shadow-sm">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>RECEIVING</span>
                            </div>
                          )}
                        </motion.div>
                      </td>

                      {/* 6. Processed Rows */}
                      <td className="py-3.5 px-3 font-mono font-black text-right text-slate-900 dark:text-white text-xs sm:text-sm lg:text-base truncate">
                        <motion.div
                          key={`rows-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          {(h.record_count ?? h.records_processed ?? 0).toLocaleString()} <span className="text-[11px] font-normal text-slate-400">rows</span>
                        </motion.div>
                      </td>

                      {/* 7. Process Duration (Avg seconds & Start - End timestamps) */}
                      <td className="py-3.5 px-3 font-mono text-right truncate">
                        <motion.div
                          key={`dur-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm lg:text-base">
                            {durationStr}
                          </div>
                          <div className="text-[11px] text-slate-400 font-bold truncate">
                            {timeRangeStr}
                          </div>
                        </motion.div>
                      </td>

                      {/* 8. Data Structure */}
                      <td className="py-3.5 px-3 text-center truncate">
                        <motion.div
                          key={`ds-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          <span
                            className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black font-mono text-[11px] sm:text-xs inline-block truncate max-w-full"
                            title={h.data_structure || h.data_type}
                          >
                            {h.data_structure || h.data_type || 'ALL'}
                          </span>
                        </motion.div>
                      </td>

                      {/* 9. Service Name */}
                      <td className="py-3.5 px-3 font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-extrabold truncate" title={h.service_name || 'GENERAL Process Data Entities'}>
                        <motion.div
                          key={`service-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, rotateX: -90, y: -4 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                        >
                          {h.service_name || 'GENERAL Process Data Entities'}
                        </motion.div>
                      </td>

                      {/* 10. Ingestion Trend Line Graph */}
                      <td className="py-3.5 px-3 text-center align-middle">
                        <motion.div
                          key={`trend-${currentPage}-${h.hospital_id}`}
                          initial={{ opacity: 0, scaleY: 0.2 }}
                          animate={{ opacity: 1, scaleY: 1 }}
                          transition={{ duration: 0.36, delay: idx * 0.08, ease: [0.23, 1, 0.32, 1] }}
                          style={{ transformOrigin: 'center center' }}
                        >
                          <IngestionSparkline points={h.sparklinePoints} isCritical={isCrit} />
                        </motion.div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/80 border-t-2 border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs sm:text-sm text-slate-500 font-mono gap-2">
          <div>
            Showing <strong className="text-slate-900 dark:text-white">{startIndex + 1}–{endIndex}</strong> of <strong className="text-slate-900 dark:text-white">{sortedHospitals.length}</strong> hospitals (Page {currentPage + 1} of {totalPages})
          </div>
          <div className="flex items-center gap-4 text-xs font-black">
            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" /> &gt;{activeGlobalThresh.delayedMaxMinutes}m: Critical
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {activeGlobalThresh.receivingMaxMinutes + 1}–{activeGlobalThresh.delayedMaxMinutes}m: Delayed
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> ≤{activeGlobalThresh.receivingMaxMinutes}m: Receiving
            </span>
          </div>
        </div>
      </Card>
      </div>
    </motion.div>
  );
};
