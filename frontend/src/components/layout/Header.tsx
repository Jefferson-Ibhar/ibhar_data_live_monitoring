import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, RefreshCw, User, AlertTriangle } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';
import { TimeFilter } from '../common/TimeFilter';
import { useMonitoring } from '../../hooks/useMonitoring';
import { triggerTestEmergencyAlert } from '../alerts/EmergencyAlertModal';
import ibharLogo from '../../assets/IbharLogo.avif';

export const Header: React.FC = () => {
  const {
    lastUpdated,
    autoRefresh,
    toggleAutoRefresh,
    manualRefresh,
    unreadAlertsCount,
    isSimulatingUpdate,
    alerts
  } = useMonitoring();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [showTestBtn, setShowTestBtn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ibhar_show_emergency_test_btn');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem('ibhar_show_emergency_test_btn');
        setShowTestBtn(saved !== 'false');
      } catch {}
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('emergency-test-btn-setting-changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('emergency-test-btn-setting-changed', handleStorageChange);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b-2 border-slate-200 dark:border-slate-800 px-4 lg:px-8 py-4 transition-colors duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left Greeting & Branding */}
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Good morning, Admin ✨
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse-dot" />
              <span className="text-[10px] uppercase font-black text-emerald-800 dark:text-emerald-300">
                Live
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <img
              src={ibharLogo}
              alt="Ibhar Logo"
              className="h-8 md:h-9 w-auto object-contain shrink-0"
            />
            <h1 className="font-heading font-medium text-slate-600 dark:text-slate-400 text-lg lg:text-xl tracking-tight leading-normal translate-y-[2px] md:translate-y-[3px]">
              Live Monitoring
            </h1>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3.5">
          {/* Test Emergency Pop-Up Button (Controlled by Settings) */}
          {showTestBtn && (
            <button
              onClick={() => triggerTestEmergencyAlert()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-2 border-red-500/30 dark:border-red-500/40 text-xs font-mono font-extrabold shadow-sm hover:shadow-md transition-all cursor-pointer"
              title="Test Emergency Pop-Up Alert with Siren and Video"
            >
              <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-red-500" />
              <span className="hidden md:inline">Test Emergency Pop-up</span>
              <span className="md:hidden">Test Alert</span>
            </button>
          )}

          {/* Time Filter */}
          <TimeFilter />

          {/* Auto Refresh & Manual Trigger */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-2xl shadow-md hover:shadow-lg transition-all">
            <button
              onClick={manualRefresh}
              title="Refresh Telemetry Now"
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isSimulatingUpdate ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              onClick={toggleAutoRefresh}
              className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Sync: <span className={autoRefresh ? 'text-emerald-600 font-extrabold' : 'text-slate-400'}>{autoRefresh ? 'ON' : 'OFF'}</span>
            </button>

            <span className="text-[11px] font-bold text-slate-500 border-l-2 border-slate-200 dark:border-slate-700 pl-2 hidden sm:inline">
              {lastUpdated}
            </span>
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notification Icon & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-md hover:shadow-lg text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-all cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4 stroke-[2.5]" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center animate-bounce shadow-md">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setIsNotificationsOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-4 z-50">
                  <div className="flex items-center justify-between mb-3 border-b-2 border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="font-heading font-black text-sm text-slate-900 dark:text-white">
                      Notifications
                    </h3>
                    {unreadAlertsCount > 0 && (
                      <span className="text-[10px] font-black bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-full">
                        {unreadAlertsCount} new
                      </span>
                    )}
                  </div>

                  <div data-lenis-prevent className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
                    {alerts.slice(0, 4).map((alert) => (
                      <Link
                        key={alert.id}
                        to="/alerts"
                        onClick={() => setIsNotificationsOpen(false)}
                        className="block p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-500 font-mono">
                            {alert.hospitalId}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold">
                            {alert.timestamp}
                          </span>
                        </div>
                        <h4 className="font-heading font-bold text-xs text-slate-900 dark:text-white mb-0.5 truncate">
                          {alert.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-semibold">
                          {alert.message}
                        </p>
                      </Link>
                    ))}
                    {alerts.length === 0 && (
                      <div className="text-center py-6 text-xs text-slate-400 font-bold">
                        No active alerts
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t-2 border-slate-100 dark:border-slate-800 text-center">
                    <Link
                      to="/alerts"
                      onClick={() => setIsNotificationsOpen(false)}
                      className="text-xs font-black text-blue-600 dark:text-blue-400 hover:underline block w-full py-1"
                    >
                      View All Incidents
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Profile Avatar */}
          <Link
            to="/profile"
            className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-md hover:shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-md">
              <User className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-xs font-bold text-slate-900 dark:text-white hidden md:inline">
              Admin
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
};
