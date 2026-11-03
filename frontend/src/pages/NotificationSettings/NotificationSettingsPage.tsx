import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../../components/common/Card';
import { Bell, Smartphone, Mail, MessageSquare, AlertTriangle, Play, Sparkles, Coins, Check } from 'lucide-react';
import { triggerTestEmergencyAlert } from '../../components/alerts/EmergencyAlertModal';

export const NotificationSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState({
    criticalSms: true,
    criticalEmail: true,
    warningEmail: true,
    whatsappAlerts: false,
    slackWebhook: true,
    dailySummaryPdf: true,
  });

  const [monthlyBudget, setMonthlyBudget] = useState<number>(() => {
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
  const [budgetSavedToast, setBudgetSavedToast] = useState(false);

  const [showTestButton, setShowTestButton] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ibhar_show_emergency_test_btn');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const handleUpdateBudget = (newBudget: number) => {
    setMonthlyBudget(newBudget);
    try {
      localStorage.setItem('ibhar_aws_monthly_budget', String(newBudget));
      window.dispatchEvent(new Event('aws-budget-setting-changed'));
      setBudgetSavedToast(true);
      setTimeout(() => setBudgetSavedToast(false), 2500);
    } catch {}
  };

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleTestButton = () => {
    const nextVal = !showTestButton;
    setShowTestButton(nextVal);
    try {
      localStorage.setItem('ibhar_show_emergency_test_btn', String(nextVal));
      window.dispatchEvent(new Event('emergency-test-btn-setting-changed'));
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-3xl mx-auto"
    >
      <div>
        <h2 className="font-heading font-extrabold text-2xl text-textLight-heading dark:text-textNight-heading flex items-center gap-2">
          NOTIFICATION RULES & CHANNELS
        </h2>
        <p className="text-xs text-textLight-secondary dark:text-textNight-secondary font-sans mt-0.5">
          Configure real-time alerting thresholds, emergency siren testing & escalation pathways
        </p>
      </div>

      {/* Emergency Pop-Up Alert Testing Section */}
      <Card variant="default" className="space-y-4 border-2 border-red-500/30 dark:border-red-500/20 bg-gradient-to-br from-red-500/[0.03] to-transparent">
        <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="font-heading font-black text-sm sm:text-base text-textLight-heading dark:text-textNight-heading">
                EMERGENCY POP-UP & AUDIO ALARM
              </h3>
              <p className="text-[11px] text-textLight-secondary dark:text-textNight-secondary font-sans">
                Full-screen video pop-up with looping emergency siren and redirect actions
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {/* Toggle to Enable / Disable Header Test Button */}
          <div className="flex items-center justify-between p-3.5 rounded-card-sm bg-nude-cardSec dark:bg-night-cardSoft border border-[#EFE4DC] dark:border-[#1C3547]">
            <div className="space-y-0.5 pr-4">
              <h4 className="font-heading font-bold text-xs text-textLight-heading dark:text-textNight-heading">
                Display "Test Emergency Pop-up" Button in Header
              </h4>
              <p className="text-[11px] text-textLight-secondary dark:text-textNight-secondary font-sans">
                Turn this option off to hide the red test button from the top navigation bar once testing is complete.
              </p>
            </div>

            <button
              onClick={handleToggleTestButton}
              className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center shrink-0 cursor-pointer ${
                showTestButton ? 'bg-red-500 justify-end' : 'bg-gray-300 dark:bg-gray-700 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Test Trigger Button */}
          <div className="p-3.5 rounded-card-sm bg-white/60 dark:bg-slate-900/40 border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-heading font-bold text-xs text-textLight-heading dark:text-textNight-heading flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Live Pop-up Simulator
              </h4>
              <p className="text-[11px] text-textLight-secondary dark:text-textNight-secondary font-sans">
                Simulate a live critical telemetry failure with the background video, warning symbol & audio siren.
              </p>
            </div>

            <button
              onClick={() => triggerTestEmergencyAlert()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-heading font-extrabold text-xs shadow-md shadow-red-600/30 transition-all shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Trigger Test Pop-up Now</span>
            </button>
          </div>
        </div>
      </Card>

      {/* AWS Cloud Monthly Budget Target Section */}
      <Card variant="default" className="space-y-4 border-2 border-indigo-500/30 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.03] to-transparent">
        <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-black text-sm sm:text-base text-textLight-heading dark:text-textNight-heading">
                AWS MONTH-TO-DATE BUDGET TARGET
              </h3>
              <p className="text-[11px] text-textLight-secondary dark:text-textNight-secondary font-sans">
                Set monthly spending threshold for dynamic MTD percentage calculation & forecast targets
              </p>
            </div>
          </div>

          {budgetSavedToast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-bold"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Budget Updated</span>
            </motion.div>
          )}
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-card-sm bg-nude-cardSec dark:bg-night-cardSoft border border-[#EFE4DC] dark:border-[#1C3547] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-heading font-bold text-xs text-textLight-heading dark:text-textNight-heading">
                Current Active Monthly Budget Target:
              </span>
              <span className="font-mono font-black text-xl text-indigo-600 dark:text-indigo-400">
                ${monthlyBudget.toLocaleString()} / month
              </span>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-textLight-secondary dark:text-textNight-secondary">
                Quick Preset Targets:
              </label>
              <div className="flex flex-wrap gap-2">
                {[500, 550, 600, 650, 700].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleUpdateBudget(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                      monthlyBudget === val
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400'
                        : 'bg-white/80 dark:bg-slate-800 text-textLight-heading dark:text-textNight-heading border border-black/10 dark:border-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                    }`}
                  >
                    ${val.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="pt-2 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-sm text-textLight-secondary dark:text-textNight-secondary">
                  $
                </span>
                <input
                  type="number"
                  min="100"
                  max="100000"
                  step="50"
                  value={monthlyBudget}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleUpdateBudget(val);
                    }
                  }}
                  className="w-full pl-7 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 text-sm font-mono font-bold text-textLight-heading dark:text-textNight-heading focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter custom budget..."
                />
              </div>
              <span className="text-[11px] text-textLight-secondary dark:text-textNight-secondary font-sans sm:max-w-xs">
                Updates KPI #3 (Month-to-Date progress) and KPI #4 (Forecast target) immediately in real time.
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card variant="default" className="space-y-4">
        <h3 className="font-heading font-bold text-base text-textLight-heading dark:text-textNight-heading">
          ALERT CHANNELS & ESCALATION
        </h3>

        <div className="space-y-3">
          {[
            { key: 'criticalSms', title: 'Critical SMS Dispatch', desc: 'Instant SMS alert when hospital feed is delayed > 120 minutes', icon: Smartphone },
            { key: 'criticalEmail', title: 'Critical Incident Email Escalation', desc: 'High-priority email dispatch to regional engineering leads', icon: Mail },
            { key: 'warningEmail', title: 'Warning Level Email Digests', desc: 'Notify operators on 30–60 min delays or payload drop warnings', icon: Mail },
            { key: 'whatsappAlerts', title: 'WhatsApp Operator Dispatch', desc: 'Direct WhatsApp notification for urgent connector outages', icon: MessageSquare },
            { key: 'slackWebhook', title: 'Slack #hospital-monitoring Channel', desc: 'Post JSON telemetry alerts directly to Slack incident channel', icon: Bell },
          ].map((item) => {
            const Icon = item.icon;
            const isChecked = settings[item.key as keyof typeof settings];
            return (
              <div key={item.key} className="flex items-center justify-between p-3.5 rounded-card-sm bg-nude-cardSec dark:bg-night-cardSoft border border-[#EFE4DC] dark:border-[#1C3547]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-night-cardElevated text-lightAccent-peach">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-heading font-bold text-xs text-textLight-heading dark:text-textNight-heading">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-textLight-secondary dark:text-textNight-secondary font-sans">
                      {item.desc}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggle(item.key as any)}
                  className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center cursor-pointer ${
                    isChecked ? 'bg-lightAccent-peach dark:bg-nightAccent-peach justify-end' : 'bg-gray-300 dark:bg-gray-700 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
};
