import React from 'react';
import { motion } from 'framer-motion';
import { useMonitoring } from '../../hooks/useMonitoring';
import { apiService } from '../../services/api';
import { AlertCard } from '../../components/alerts/AlertCard';
import { EmptyState } from '../../components/common/EmptyState';
import { BellRing, CheckCheck } from 'lucide-react';

export const AlertsPage: React.FC = () => {
  const { alerts, markAlertAsRead } = useMonitoring();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-extrabold text-2xl text-textLight-heading dark:text-textNight-heading flex items-center gap-2">
            TELEMETRY ALERTS
          </h2>
          <p className="text-xs text-textLight-secondary dark:text-textNight-secondary font-sans mt-0.5">
            Real-time automated incident and sync error notifications (last 20 days)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-nude-card dark:bg-night-card border border-[#EFE4DC] dark:border-[#102437] text-xs font-mono">
            <BellRing className="w-4 h-4 text-lightAccent-coral dark:text-nightAccent-coral" />
            <span>Total Alerts: <strong>{alerts.length}</strong></span>
          </div>

          {alerts.length > 0 && (
            <button
              onClick={() => {
                alerts.forEach(a => markAlertAsRead(a.id));
                apiService.acknowledgeMultipleAlerts(alerts.map(a => a.id));
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-nude-peachTint/70 dark:bg-night-cardElevated text-xs font-cute font-bold text-textLight-heading dark:text-textNight-heading border border-[#E8A982]/40 hover:bg-nude-peachTint dark:hover:bg-night-cardSoft transition-all shadow-sm cursor-pointer"
            >
              <CheckCheck className="w-4 h-4 text-[#91A995]" />
              <span>Mark All Read</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts List */}
      {alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onMarkRead={markAlertAsRead} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Alerts Found"
          message="There are currently no telemetry alerts. Everything is operating normally."
        />
      )}
    </motion.div>
  );
};

