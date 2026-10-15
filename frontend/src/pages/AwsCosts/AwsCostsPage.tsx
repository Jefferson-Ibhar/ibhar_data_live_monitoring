import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Coins,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Zap,
  Play,
  Tv,
  Server,
  CloudLightning
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { apiService } from '../../services/api';

export const AwsCostsPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [serviceData, setServiceData] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // 30s Page Auto-Swap states (between AWS Costs and Live)
  const [isPageRotating, setIsPageRotating] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ibhar_auto_page_rotate');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [pageTimeRemaining, setPageTimeRemaining] = useState<number>(30);

  // Dynamic Month-to-Date Budget Target (configured dynamically via Settings)
  const [customBudget, setCustomBudget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ibhar_aws_monthly_budget');
      return saved ? parseFloat(saved) : 2800;
    } catch {
      return 2800;
    }
  });

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

  const togglePageRotate = () => {
    setIsPageRotating(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ibhar_auto_page_rotate', String(next));
      } catch (e) {}
      return next;
    });
  };

  // 30-Second Page Transition Timer (AWS Costs -> Live)
  useEffect(() => {
    if (!isPageRotating) return;

    setPageTimeRemaining(30);
    const startMs = Date.now();
    const durationMs = 30000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const left = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setPageTimeRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        navigate('/live');
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPageRotating, navigate]);

  const lastFetchedAtRef = useRef<string>('');
  const kpiGridRef = useRef<HTMLDivElement>(null);

  // By default, auto-position the page at the KPI cards grid below the sticky header
  useEffect(() => {
    let timeoutId: any;
    const scrollToKpiGrid = () => {
      if (kpiGridRef.current) {
        const headerEl = document.querySelector('header');
        const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 72;
        const rect = kpiGridRef.current.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetTop = rect.top + scrollTop - headerHeight - 8;

        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'instant'
        });
      }
    };

    scrollToKpiGrid();
    const frameId = requestAnimationFrame(scrollToKpiGrid);
    timeoutId = setTimeout(scrollToKpiGrid, 80);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, []);

  const fetchDashboardData = async (silent = false) => {
    try {
      if (!silent) setErrorMsg(null);
      const [sum, day, srv, res] = await Promise.all([
        apiService.getAwsCostSummary(),
        apiService.getAwsDailyCosts(30),
        apiService.getAwsCostByService(7),
        apiService.getAwsRunningServices()
      ]);

      if (sum && sum.success !== false) {
        setSummary(sum);
        if (sum.last_updated) {
          setLastUpdated(sum.last_updated);
        }

        // Auto-detect when new twice-daily AWS data arrives in database
        const currentFetchedAt = sum.fetched_at || sum.last_updated || '';
        if (lastFetchedAtRef.current && currentFetchedAt && currentFetchedAt !== lastFetchedAtRef.current) {
          setSyncNotice('✨ Fresh twice-daily AWS Cost data received! All charts and metrics have auto-updated.');
          setTimeout(() => setSyncNotice(null), 8000);
        }
        if (currentFetchedAt) {
          lastFetchedAtRef.current = currentFetchedAt;
        }
      }
      if (day && day.results) setDailyData(day.results);
      if (srv && srv.services) setServiceData(srv.services);
      if (res && res.resources) setResources(res.resources);

      if (!sum?.last_updated) {
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      console.error('Failed to load AWS Cost telemetry:', err);
      if (!silent) setErrorMsg('Could not reach AWS Cost API. Showing cached snapshot.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-polling cycle set to 30s: fast auto-update when new data arrives (reads local DB, zero AWS fees)
  useEffect(() => {
    fetchDashboardData(false);
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Immediate refresh when user switches back to this browser tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const handleForceAwsSync = async () => {
    const confirmed = window.confirm(
      'Triggering an on-demand AWS Cost Explorer sync will invoke AWS APIs ($0.01 per query). A 1-hour cooldown applies.\n\nDo you wish to proceed?'
    );
    if (!confirmed) return;

    setIsForceSyncing(true);
    setSyncNotice(null);
    try {
      const res = await apiService.refreshAwsCostSnapshot();
      if (res && res.success) {
        setSyncNotice('AWS snapshot refreshed successfully!');
        await fetchDashboardData();
      } else if (res && res.error) {
        setSyncNotice(res.error);
      } else {
        setSyncNotice('AWS refresh request submitted.');
        await fetchDashboardData();
      }
    } catch (err: any) {
      setSyncNotice('Failed to trigger AWS Cost sync.');
    } finally {
      setIsForceSyncing(false);
      setTimeout(() => setSyncNotice(null), 8000);
    }
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // 1. Last 7 Days Daily Spend Chart Data (derived from dailyData)
  const last7DaysData = dailyData.slice(-7);
  const last7DaysChartPoints = last7DaysData.map((item: any) => {
    const amt = Number(item.Total?.UnblendedCost?.Amount || 0);
    const dt = new Date(item.TimePeriod?.Start || '');
    const dateLabel = isNaN(dt.getTime()) ? '' : `${monthNames[dt.getMonth()]} ${dt.getDate()}`;
    const weekday = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(undefined, { weekday: 'short' });
    return {
      date: dateLabel,
      weekday,
      spend: Number(amt.toFixed(2)),
      fullDate: isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  });

  const total7Days = last7DaysChartPoints.reduce((sum, cur) => sum + cur.spend, 0);
  const peak7Days = last7DaysChartPoints.reduce((max, cur) => (cur.spend > max ? cur.spend : max), 0);
  const nonZeroDays = last7DaysChartPoints.filter(p => p.spend > 0);
  const lowest7Days = nonZeroDays.length > 0 ? Math.min(...nonZeroDays.map(p => p.spend)) : (last7DaysChartPoints.length > 0 ? Math.min(...last7DaysChartPoints.map(p => p.spend)) : 0);
  const avgDaily7Days = last7DaysChartPoints.length > 0 ? total7Days / last7DaysChartPoints.length : 0;

  const activeServices = serviceData.filter((srv: any) => Number(srv.amount) > 0);
  const displayServices = activeServices.length > 0 ? activeServices : serviceData.slice(0, 7);

  // 2. 30-Day Daily total sum & Rank-based 4-Tier color mapping
  const total30Days = dailyData.reduce((sum: number, cur: any) => sum + Number(cur.Total?.UnblendedCost?.Amount || 0), 0);

  const sortedAmounts = [...dailyData]
    .map((item: any) => Number(item.Total?.UnblendedCost?.Amount || 0))
    .sort((a, b) => b - a);

  const dailyChartPoints = dailyData.map((item: any) => {
    const amt = Number(item.Total?.UnblendedCost?.Amount || 0);
    const dt = new Date(item.TimePeriod?.Start || '');
    const dateLabel = isNaN(dt.getTime()) ? '' : `${monthNames[dt.getMonth()]} ${dt.getDate()}`;
    const rankIndex = sortedAmounts.indexOf(amt);

    let gradientId = 'dailyGreen';
    let rankBadge = 'Standard (Remaining)';
    let badgeColor = '#10B981';

    if (rankIndex < 3) {
      gradientId = 'dailyRose';
      rankBadge = `Top 3 Peak (#${rankIndex + 1})`;
      badgeColor = '#F43F5E';
    } else if (rankIndex < 6) {
      gradientId = 'dailyAmber';
      rankBadge = `Top 4-6 High (#${rankIndex + 1})`;
      badgeColor = '#F59E0B';
    } else if (rankIndex < 9) {
      gradientId = 'dailyPurple';
      rankBadge = `Top 7-9 Moderate (#${rankIndex + 1})`;
      badgeColor = '#8B5CF6';
    }

    return {
      date: dateLabel,
      amount: amt,
      gradientId,
      rankBadge,
      badgeColor,
    };
  });

  const isMock = summary?.is_mock ?? true;
  const healthStatus = (summary?.integration_health || 'healthy').toLowerCase();
  const effectiveBudget = customBudget || summary?.budget_limit || 2800;
  const mtdCost = Number(summary?.mtd_cost ?? 412.50);
  const budgetUsedPercent = Number(((mtdCost / effectiveBudget) * 100).toFixed(1));
  const forecastCost = Number(summary?.forecast_cost ?? 2450.00);
  const hourlyRate = Number(summary?.current_hourly_rate ?? 2.85);

  // Derive Yesterday's spend (most recent full finalized day)
  const { yesterdayCost, yesterdayLabel } = (() => {
    if (summary?.yesterday_cost !== undefined && summary?.yesterday_cost !== null && Number(summary.yesterday_cost) > 0) {
      return { yesterdayCost: Number(summary.yesterday_cost), yesterdayLabel: 'Yesterday' };
    }
    if (dailyData && dailyData.length > 0) {
      const todayIso = new Date().toISOString().split('T')[0];
      const pastEntries = dailyData.filter((d: any) => {
        const start = d.TimePeriod?.Start || '';
        return start < todayIso;
      });
      const targetEntry = pastEntries.length > 0 ? pastEntries[pastEntries.length - 1] : dailyData[dailyData.length - 1];
      const amt = Number(targetEntry?.Total?.UnblendedCost?.Amount || 0);
      const startDt = targetEntry?.TimePeriod?.Start ? new Date(targetEntry.TimePeriod.Start) : null;
      const label = startDt && !isNaN(startDt.getTime())
        ? `${monthNames[startDt.getMonth()]} ${startDt.getDate()}`
        : 'Yesterday';
      return { yesterdayCost: amt, yesterdayLabel: label };
    }
    return { yesterdayCost: Number(summary?.today_cost ?? 22.77), yesterdayLabel: 'Yesterday' };
  })();

  const ec2Resources = resources.filter((r: any) => r.type?.toLowerCase().includes('ec2'));
  const totalEc2Count = ec2Resources.length || 3;
  const runningEc2Count = ec2Resources.filter((r: any) => r.state?.toLowerCase() === 'running').length || totalEc2Count;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 pb-12"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
            <Coins className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                AWS Cost & Telemetry
              </h1>
              {isMock ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  MOCK DATA MODE
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  LIVE AWS
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Cloud Infrastructure Spend, Run Rates & Hospital DB Server Health
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 self-start sm:self-auto">
          {/* 30s Auto Page Rotator (AWS Cost <-> Live) */}
          <button
            onClick={togglePageRotate}
            title={isPageRotating ? "Auto-transition active: Will switch back to Live Monitoring after 30s. Click to pause." : "Auto-transition paused. Click to resume."}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-sm ${
              isPageRotating
                ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 ring-2 ring-indigo-400/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
            }`}
          >
            <Tv className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>
              {isPageRotating ? `Live Stream in ${pageTimeRemaining}s` : 'Page Swap: PAUSED'}
            </span>
            {isPageRotating ? (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
            ) : (
              <Play className="w-3 h-3" />
            )}
          </button>

          {/* Force AWS Sync Button */}
          {!isMock && (
            <button
              onClick={handleForceAwsSync}
              disabled={isForceSyncing}
              title="Trigger an on-demand AWS Cost Explorer sync (1h cooldown)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <CloudLightning className={`w-3.5 h-3.5 ${isForceSyncing ? 'animate-bounce' : ''}`} />
              <span>{isForceSyncing ? 'Syncing...' : 'Sync AWS'}</span>
            </button>
          )}

          {/* Snapshot Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{lastUpdated ? `Data as of ${lastUpdated}` : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Sync Notice Banner */}
      {syncNotice && (
        <div className="p-3.5 bg-blue-50 dark:bg-blue-950/60 border-2 border-blue-200 dark:border-blue-800 rounded-2xl flex items-center justify-between gap-2.5 text-blue-700 dark:text-blue-300 text-xs font-bold">
          <span>{syncNotice}</span>
          <button onClick={() => setSyncNotice(null)} className="text-blue-500 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Error / Stale Banner */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Cards Grid - Auto-scrolled to here by default */}
      <div ref={kpiGridRef} id="aws-kpi-grid" className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {/* KPI 1: Hourly Burn (Estimate) */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-2">
            <span>HOURLY BURN (EST.)</span>
            <Zap className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ${hourlyRate.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-slate-400">/hr</span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Est. ${(hourlyRate * 24).toFixed(0)} / 24-hr day
          </p>
        </div>

        {/* KPI 2: Yesterday's Spend */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-2">
            <span>YESTERDAY'S SPEND</span>
            <Zap className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ${yesterdayCost.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {yesterdayLabel ? `${yesterdayLabel} finalized` : 'Full 24-hr finalized spend'}
          </p>
        </div>

        {/* KPI 3: Month-to-Date */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-2">
            <span>MONTH-TO-DATE</span>
            <button
              onClick={() => navigate('/notification-settings')}
              title="Configure Dynamic Monthly Budget in Settings"
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-500 transition-colors cursor-pointer"
            >
              <Coins className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
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
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {budgetUsedPercent}% of ${effectiveBudget.toLocaleString()} budget
              </p>
              <button
                onClick={() => navigate('/notification-settings')}
                className="text-[9px] font-bold text-indigo-500 hover:text-indigo-600 underline cursor-pointer"
                title="Edit dynamic monthly budget in settings"
              >
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* KPI 4: Month-End Forecast */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-2">
            <span>FORECAST</span>
            <TrendingUp className={`w-4 h-4 ${forecastCost > effectiveBudget ? 'text-rose-500' : 'text-purple-500'}`} />
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className={`text-2xl font-black font-mono ${forecastCost > effectiveBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              ${forecastCost.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Target: &lt; ${effectiveBudget.toLocaleString()}
          </p>
        </div>

        {/* KPI 5: EC2 Compute Fleet Health */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-1">
            <span>EC2 COMPUTE FLEET</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
              healthStatus === 'healthy' 
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
            }`}>
              {healthStatus.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 my-1 py-1 px-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-center">
            <div>
              <span className="block text-[9px] font-bold text-slate-400">NODES</span>
              <span className="text-xs font-black font-mono text-slate-800 dark:text-slate-200">
                {totalEc2Count}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-bold text-slate-400">RUNNING</span>
              <span className="text-xs font-black font-mono text-slate-800 dark:text-slate-200">
                {runningEc2Count}/{totalEc2Count}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-bold text-slate-400">STATUS</span>
              <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                100%
              </span>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
            <Server className="w-3 h-3 text-slate-400 shrink-0" />
            AWS EC2 Virtual Fleet
          </p>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Last 7 Days Daily Spend (2 Cols) - Area Chart */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Last 7 Days Daily Spend
                </h2>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Recent daily spend trajectory from daily Cost Explorer telemetry
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  Peak: <strong className="font-mono text-blue-600 dark:text-blue-400">${peak7Days.toFixed(2)}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  7-Day Total: <strong className="font-mono">${total7Days.toFixed(2)}</strong>
                </span>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="flex-1 min-h-[220px] w-full pt-2 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last7DaysChartPoints} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sevenDaySpendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tickFormatter={(val) => `$${Number(val).toFixed(0)}`}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={{ stroke: '#334155' }}
                    domain={[0, (dataMax: number) => Math.ceil((dataMax * 1.15) / 10) * 10 || 100]}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-xl shadow-2xl text-xs font-mono border border-slate-700 pointer-events-none">
                            <div className="text-slate-400 text-[10px] font-bold border-b border-slate-800 pb-1 mb-1">
                              {data.fullDate || data.date}
                            </div>
                            <div className="text-blue-400 font-black text-sm">
                              Daily Spend: ${Number(data.spend).toFixed(2)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#sevenDaySpendGradient)"
                    dot={{ r: 4, fill: '#60a5fa', stroke: '#1d4ed8', strokeWidth: 1.5 }}
                    activeDot={{ r: 7, fill: '#93c5fd', stroke: '#1e40af', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 7-Day Quick Metric Footer Bar */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average / Day</span>
              <span className="text-xs font-black font-mono text-slate-800 dark:text-slate-200">${avgDaily7Days.toFixed(2)}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lowest Day</span>
              <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">${lowest7Days.toFixed(2)}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Services</span>
              <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">{activeServices.length || serviceData.length}</span>
            </div>
          </div>
        </div>

        {/* Cost by AWS Service (1 Col) */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Cost by AWS Service
              </h2>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                7 Days
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">
              Active infrastructure spenders ({displayServices.length})
            </p>

            <div className="space-y-2">
              {displayServices.map((srv: any, idx: number) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold gap-2">
                    <span className="text-slate-700 dark:text-slate-300 truncate" title={srv.service}>
                      {srv.service.replace('Amazon ', '').replace('AWS ', '')}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                        {srv.percentage}%
                      </span>
                      <span className="font-mono font-extrabold text-slate-900 dark:text-white min-w-[52px] text-right">
                        ${Number(srv.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        idx === 0 ? 'bg-blue-500' :
                        idx === 1 ? 'bg-indigo-500' :
                        idx === 2 ? 'bg-emerald-500' :
                        idx === 3 ? 'bg-amber-500' :
                        idx === 4 ? 'bg-rose-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.max(2, srv.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Daily Spend Trend */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              30-Day Daily Spend Trend
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Aggregated daily Cost Explorer expenditure categorized by spend tiers
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Color Legend for 4 Tiers */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold mr-2">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-[#F43F5E] border border-rose-200 dark:border-rose-900">
                <span className="w-2 h-2 rounded-full bg-[#F43F5E]" />
                Top 3 Spike (#1-#3)
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-[#F59E0B] border border-amber-200 dark:border-amber-900">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                High (#4-#6)
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-[#8B5CF6] border border-purple-200 dark:border-purple-900">
                <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                Moderate (#7-#9)
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-[#10B981] border border-emerald-200 dark:border-emerald-900">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                Baseline (Remaining)
              </span>
            </div>

            <span className="px-3 py-1 rounded-xl text-xs font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap">
              30-Day Total: ${total30Days.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Recharts BarChart */}
        <div className="h-64 w-full pt-3 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyChartPoints} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="dailyRose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB7185" />
                  <stop offset="100%" stopColor="#E11D48" />
                </linearGradient>

                <linearGradient id="dailyAmber" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>

                <linearGradient id="dailyPurple" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A855F7" />
                  <stop offset="100%" stopColor="#7C3AED" />
                </linearGradient>

                <linearGradient id="dailyGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} vertical={false} />

              <XAxis
                dataKey="date"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
                interval={1}
              />

              <YAxis
                stroke="#64748b"
                tickFormatter={(val) => `$${Number(val).toFixed(0)}`}
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
                domain={[0, (dataMax: number) => Math.ceil((dataMax * 1.15) / 10) * 10 || 150]}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-xl shadow-2xl text-xs font-mono border border-slate-700 pointer-events-none space-y-1">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1">
                          <span className="text-slate-400 text-[10px] font-bold">{data.date}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black text-white" style={{ backgroundColor: data.badgeColor }}>
                            {data.rankBadge}
                          </span>
                        </div>
                        <div className="text-white font-black text-sm">
                          Daily Spend: ${Number(data.amount).toFixed(2)}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {dailyChartPoints.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={`url(#${entry.gradientId})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Running AWS Resources Table */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              Currently Running AWS Resources
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Live infrastructure inventory powering the Hospital Data Platform
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            {resources.length} Active Resources
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider">
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Identifier / Name</th>
                <th className="py-2.5 px-3">Region</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Configuration</th>
                <th className="py-2.5 px-3">Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {resources.map((res: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-extrabold text-[11px] text-blue-600 dark:text-blue-400">
                      {res.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                    {res.name || res.id}
                  </td>
                  <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-medium">
                    {res.region}
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 uppercase text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {res.state}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-medium">
                    {res.details || '—'}
                  </td>
                  <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-medium">
                    {res.uptime || 'Active'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default AwsCostsPage;
