import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  BellRing,
  BarChart3,
  HeartPulse,
  GitCompare,
  Settings,
  Activity,
  TrendingUp,
  Coins
} from 'lucide-react';
import { useMonitoring } from '../../hooks/useMonitoring';
import ibharLogo from '../../assets/IbharLogo.avif';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  badge?: number;
}

interface SidebarProps {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isExpanded, setIsExpanded }) => {
  const { unreadAlertsCount, hospitals, isBackendConnected } = useMonitoring();

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Live', path: '/live', icon: TrendingUp },
    { name: 'Hospitals', path: '/hospitals', icon: Building2 },
    { name: 'Alerts', path: '/alerts', icon: BellRing, badge: unreadAlertsCount },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'AWS Costs', path: '/aws-costs', icon: Coins },
    { name: 'Integration Health', path: '/integration-health', icon: HeartPulse },
    { name: 'Comparison', path: '/comparison', icon: GitCompare },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const handleItemClick = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  return (
    <aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      className={`hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40 bg-white dark:bg-slate-900 border-r-2 border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-black/50 transition-all duration-300 ease-in-out ${
        isExpanded ? 'w-64 p-5' : 'w-20 p-3'
      }`}
    >
      {/* Brand Header */}
      <div className={`flex items-center ${isExpanded ? 'justify-between' : 'justify-center'} mb-6 pb-3 border-b-2 border-slate-100 dark:border-slate-800`}>
        <div className="flex items-center gap-3 select-none overflow-hidden shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transition-transform shrink-0">
            <Activity className="w-6 h-6 animate-pulse stroke-[2.5]" />
          </div>

          {isExpanded && (
            <div className="whitespace-nowrap transition-opacity duration-200">
              <div className="flex items-center gap-1">
                <img
                  src={ibharLogo}
                  alt="Ibhar Logo"
                  className="h-6 w-auto object-contain shrink-0"
                />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-0.5">
                Live Monitoring
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation List - Smooth scrollable without visible scrollbar */}
      <nav data-lenis-prevent className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden py-1 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleItemClick}
              title={!isExpanded ? `${item.name} (Click symbol to show text)` : undefined}
              className={({ isActive }) =>
                `flex items-center ${
                  isExpanded ? 'justify-between px-4 py-3.5' : 'justify-center p-3'
                } rounded-2xl text-sm font-extrabold transition-all duration-200 group relative border ${
                  isActive
                    ? 'bg-blue-50/80 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border-blue-100 dark:border-blue-900/50 shadow-sm shadow-blue-500/5'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3.5 min-w-0 z-10">
                    <Icon
                      className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                        isActive
                          ? 'text-blue-600 dark:text-blue-400 stroke-[2.5]'
                          : 'text-slate-600 dark:text-slate-400 stroke-[2] group-hover:text-slate-900 dark:group-hover:text-white'
                      }`}
                    />
                    {isExpanded && (
                      <span className={`truncate whitespace-nowrap ${
                        isActive 
                          ? 'text-blue-700 dark:text-blue-300 font-black' 
                          : 'text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white'
                      }`}>
                        {item.name}
                      </span>
                    )}
                  </div>

                  {item.badge && item.badge > 0 ? (
                    isExpanded ? (
                      <span className="px-2 py-0.5 text-xs font-black rounded-full bg-red-600 text-white shadow-sm shrink-0 z-10">
                        {item.badge}
                      </span>
                    ) : (
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white dark:border-slate-900 animate-pulse z-10" />
                    )
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* System Quick Status Footer */}
      <div className="mt-auto pt-3 border-t-2 border-slate-100 dark:border-slate-800">
        <div
          className={`rounded-2xl ${
            isBackendConnected 
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-200 dark:border-emerald-800' 
              : 'bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-200 dark:border-rose-800'
          } transition-all ${
            isExpanded ? 'p-3' : 'p-2.5 flex justify-center'
          }`}
        >
          {isExpanded ? (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`font-extrabold ${isBackendConnected ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                  Live Telemetry API
                </span>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${isBackendConnected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
              </div>
              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                {hospitals.length || 47} Hospitals • Live Cloud Stream
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1" title={isBackendConnected ? "Live Telemetry API: Connected" : "Live Telemetry API: Disconnected"}>
              <span className={`inline-block w-3 h-3 rounded-full ${isBackendConnected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

