import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { soundAlert } from '../../utils/soundAlert';
import { apiService } from '../../services/api';
import type { Alert } from '../../types';
import notificationBgVideo from '../../assets/Notification_background.mp4';

interface EmergencyAlertModalProps {
  alerts: Alert[];
  onAcknowledgeAlert?: (alertId: string) => void;
}

export const triggerTestEmergencyAlert = (customAlert?: Partial<Alert>) => {
  const defaultTestAlert: Alert = {
    id: `test-emergency-${Date.now()}`,
    hospitalId: 'HC1873',
    hospitalName: 'Jehangir Hospital',
    type: 'critical',
    title: 'Live Sync Error: IN_PATIENT_INFO',
    message: 'System.Data.SqlClient.SqlException (0x80131904): Execution Timeout Expired. The timeout period elapsed prior to completion of the operation or the server is not responding.',
    timestamp: new Date().toISOString(),
    lastReceived: 'Just now',
    category: 'IN_PATIENT_INFO',
    isRead: false,
    severity: 'CRITICAL',
    status: 'ACTIVE',
    insert_sql: 'INSERT INTO InPatientLiveSync (HospitalCode, SyncTime, RecordsProcessed) VALUES (\'HC1873\', GETDATE(), 0);',
    ...customAlert
  };

  window.dispatchEvent(new CustomEvent('trigger-test-emergency-popup', { detail: defaultTestAlert }));
};

export const EmergencyAlertModal: React.FC<EmergencyAlertModalProps> = ({
  alerts,
  onAcknowledgeAlert
}) => {
  const navigate = useNavigate();
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ibhar_acknowledged_emergency_alerts');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Listen for test popup trigger events
  useEffect(() => {
    const handleTestTrigger = (e: Event) => {
      const customEvent = e as CustomEvent<Alert>;
      if (customEvent.detail) {
        setActiveAlert(customEvent.detail);
      }
    };

    window.addEventListener('trigger-test-emergency-popup', handleTestTrigger);
    return () => {
      window.removeEventListener('trigger-test-emergency-popup', handleTestTrigger);
    };
  }, []);

  // Only alert the emergency pop-up if the alert timestamp is within the last 3 days (<= 72 hours)
  const isEligibleForEmergencyPopup = (alert: Alert): boolean => {
    if (alert.id.startsWith('test-emergency-')) return true;
    if (!alert.timestamp) return false;
    const alertDate = new Date(alert.timestamp);
    const timeMs = alertDate.getTime();
    if (isNaN(timeMs)) return false;
    const ageMs = Date.now() - timeMs;
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    // Allow fresh alerts up to 3 days old (silence older historical errors > 3 days)
    return ageMs <= THREE_DAYS_MS;
  };

  // Find the latest unacknowledged critical alert from the last 3 days
  useEffect(() => {
    const unacknowledged = alerts.filter(
      a =>
        !acknowledgedIds.has(a.id) &&
        !a.isRead &&
        (a.severity === 'CRITICAL' || a.type === 'critical' || a.status === 'ACTIVE') &&
        isEligibleForEmergencyPopup(a)
    );

    if (unacknowledged.length > 0) {
      // Pick the newest one
      const newest = unacknowledged[0];
      setActiveAlert(newest);
    } else if (!activeAlert?.id.startsWith('test-emergency-')) {
      setActiveAlert(null);
      soundAlert.stopEmergencySiren();
    }
  }, [alerts, acknowledgedIds]);

  // Audio siren trigger - Remains ON automatically while alert is active
  useEffect(() => {
    if (activeAlert) {
      soundAlert.startEmergencySiren();
    } else {
      soundAlert.stopEmergencySiren();
    }

    return () => {
      soundAlert.stopEmergencySiren();
    };
  }, [activeAlert]);

  if (!activeAlert) return null;

  const markCurrentAsAcknowledged = () => {
    soundAlert.stopEmergencySiren();
    if (activeAlert) {
      const updated = new Set(acknowledgedIds);
      updated.add(activeAlert.id);
      setAcknowledgedIds(updated);
      try {
        localStorage.setItem('ibhar_acknowledged_emergency_alerts', JSON.stringify(Array.from(updated)));
      } catch {}

      // Persist global server-side acknowledgment across all browsers/TVs
      if (!activeAlert.id.startsWith('test-emergency-')) {
        apiService.acknowledgeAlert(activeAlert.id, activeAlert.hospitalId);
      }

      if (onAcknowledgeAlert) {
        onAcknowledgeAlert(activeAlert.id);
      }
    }
    setActiveAlert(null);
  };

  const handleWarningClickAndRedirect = () => {
    markCurrentAsAcknowledged();
    navigate('/alerts');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        {/* Animated Pop-Up Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-xl overflow-hidden rounded-3xl border-2 border-red-500/80 bg-slate-950 text-white shadow-[0_0_80px_rgba(239,68,68,0.45)]"
        >
          {/* Background Video Layer */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <video
              src={notificationBgVideo}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover opacity-35 filter contrast-125"
            />
            {/* Dark Radial Overlay to make text perfectly readable */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
          </div>

          {/* Top Bar with Incident Badge */}
          <div className="relative z-10 flex items-center justify-between border-b border-red-500/30 bg-red-950/60 px-5 py-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="font-mono text-xs font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> Live Telemetry Emergency Alert
              </span>
            </div>
          </div>

          {/* Main Modal Body */}
          <div className="relative z-10 p-6 sm:p-8 space-y-5 text-center flex flex-col items-center">
            {/* Interactive Animated Warning Symbol (Click to redirect to /alerts) */}
            <button
              onClick={handleWarningClickAndRedirect}
              className="group relative flex items-center justify-center p-5 rounded-3xl bg-red-500/20 border-2 border-red-500/80 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] hover:scale-110 hover:bg-red-500/30 hover:shadow-[0_0_45px_rgba(239,68,68,0.8)] transition-all duration-300 cursor-pointer"
              title="Click Warning to View in Alerts Page"
            >
              <div className="absolute inset-0 rounded-3xl border border-red-400 animate-ping opacity-30" />
              <AlertTriangle className="w-12 h-12 sm:w-14 sm:h-14 stroke-[2.5] drop-shadow-[0_0_12px_rgba(239,68,68,0.8)] group-hover:rotate-6 transition-transform" />
            </button>

            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black font-heading tracking-tight text-white drop-shadow-md">
                {activeAlert.hospitalName || activeAlert.hospitalId}
              </h2>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                <span className="px-2.5 py-0.5 rounded-md bg-white/10 font-mono text-xs font-bold text-slate-300 border border-white/10">
                  {activeAlert.hospitalId}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-red-500/30 font-mono text-xs font-extrabold text-red-300 border border-red-500/40">
                  {activeAlert.category || 'IN_PATIENT_INFO'}
                </span>
                {activeAlert.timestamp && (
                  <span className="font-mono text-xs text-slate-400">
                    {new Date(activeAlert.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                    {new Date(activeAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            {/* Error Message Box */}
            <div className="w-full text-left rounded-2xl bg-black/60 border border-red-500/40 p-4 font-mono text-xs text-red-300 backdrop-blur-md space-y-1 shadow-inner">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400/90 block">
                Failure Diagnostic Payload:
              </span>
              <p className="line-clamp-3 leading-relaxed whitespace-pre-wrap select-all font-medium text-slate-100">
                {activeAlert.message || 'Execution Timeout Expired / Connection Error in live data ingestion stream.'}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="w-full pt-2 flex flex-col sm:flex-row items-center gap-3">
              {/* Primary: Redirect to Alerts Page */}
              <button
                onClick={handleWarningClickAndRedirect}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-heading font-extrabold text-sm bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-600/40 hover:shadow-red-500/60 transition-all cursor-pointer"
              >
                <span>View in Alerts Page</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Secondary: Acknowledge (OK) */}
              <button
                onClick={markCurrentAsAcknowledged}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl font-heading font-bold text-sm bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Acknowledge (OK)</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
