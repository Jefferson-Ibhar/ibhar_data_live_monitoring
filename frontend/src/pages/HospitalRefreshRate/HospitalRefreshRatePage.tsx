import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../../components/common/Card';
import {
  Sliders,
  CheckCircle2,
  Search,
  RotateCcw,
  Filter
} from 'lucide-react';
import { useMonitoring } from '../../hooks/useMonitoring';

interface HospitalThresholdConfig {
  receivingMaxMinutes: number; // <= X is Receiving
  delayedMaxMinutes: number;   // > X and <= Y is Delayed, > Y is Critical
}

const DEFAULT_GLOBAL_THRESHOLDS: HospitalThresholdConfig = {
  receivingMaxMinutes: 30,
  delayedMaxMinutes: 61
};

export const HospitalRefreshRatePage: React.FC = () => {
  const { integrationHealthData, hospitals } = useMonitoring();

  // Load custom hospital overrides from localStorage
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<string, HospitalThresholdConfig>>(() => {
    try {
      const saved = localStorage.getItem('ibhar_hospital_thresholds');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [globalThreshold, setGlobalThreshold] = useState<HospitalThresholdConfig>(() => {
    try {
      const saved = localStorage.getItem('ibhar_global_threshold');
      return saved ? JSON.parse(saved) : DEFAULT_GLOBAL_THRESHOLDS;
    } catch {
      return DEFAULT_GLOBAL_THRESHOLDS;
    }
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCustomOnly, setFilterCustomOnly] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Extract unique hospital list from live API data
  const hospitalList = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    if (integrationHealthData?.data) {
      integrationHealthData.data.forEach(h => {
        const id = h.hospital_id || h.hospital_code || '';
        if (id && !seen.has(id)) {
          seen.add(id);
          list.push({ id, name: h.hospital_name || id });
        }
      });
    }

    if (list.length === 0 && hospitals) {
      hospitals.forEach(h => {
        if (h.id && !seen.has(h.id)) {
          seen.add(h.id);
          list.push({ id: h.id, name: h.name || h.id });
        }
      });
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [integrationHealthData, hospitals]);

  const filteredHospitals = useMemo(() => {
    return hospitalList.filter(h => {
      const matchesSearch =
        searchQuery === '' ||
        h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.id.toLowerCase().includes(searchQuery.toLowerCase());

      const isCustom = Boolean(thresholdOverrides[h.id]);
      if (filterCustomOnly && !isCustom) return false;

      return matchesSearch;
    });
  }, [hospitalList, searchQuery, filterCustomOnly, thresholdOverrides]);

  const handleUpdateGlobalThreshold = (
    field: keyof HospitalThresholdConfig,
    value: number
  ) => {
    const updated = {
      ...globalThreshold,
      [field]: Math.max(1, value)
    };

    if (field === 'receivingMaxMinutes' && updated.delayedMaxMinutes <= updated.receivingMaxMinutes) {
      updated.delayedMaxMinutes = updated.receivingMaxMinutes + 1;
    }
    if (field === 'delayedMaxMinutes' && updated.delayedMaxMinutes <= updated.receivingMaxMinutes) {
      updated.receivingMaxMinutes = Math.max(1, updated.delayedMaxMinutes - 1);
    }

    setGlobalThreshold(updated);
    try {
      localStorage.setItem('ibhar_global_threshold', JSON.stringify(updated));
      window.dispatchEvent(new Event('ibhar_thresholds_updated'));
      setSavedNotice(`Updated system-wide default thresholds (Receiving ≤ ${updated.receivingMaxMinutes}m, Critical > ${updated.delayedMaxMinutes}m)`);
      setTimeout(() => setSavedNotice(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyGlobalPreset = (receiving: number, delayed: number, name: string) => {
    const updated = {
      receivingMaxMinutes: receiving,
      delayedMaxMinutes: delayed
    };
    setGlobalThreshold(updated);
    try {
      localStorage.setItem('ibhar_global_threshold', JSON.stringify(updated));
      window.dispatchEvent(new Event('ibhar_thresholds_updated'));
      setSavedNotice(`Applied ${name} (Receiving ≤ ${receiving}m, Critical > ${delayed}m)`);
      setTimeout(() => setSavedNotice(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateHospitalThreshold = (
    id: string,
    field: keyof HospitalThresholdConfig,
    value: number
  ) => {
    const current = thresholdOverrides[id] || { ...globalThreshold };
    const updated = {
      ...current,
      [field]: Math.max(1, value)
    };

    // Ensure delayedMax is greater than receivingMax
    if (field === 'receivingMaxMinutes' && updated.delayedMaxMinutes <= updated.receivingMaxMinutes) {
      updated.delayedMaxMinutes = updated.receivingMaxMinutes + 1;
    }

    const nextOverrides = {
      ...thresholdOverrides,
      [id]: updated
    };

    setThresholdOverrides(nextOverrides);
    try {
      localStorage.setItem('ibhar_hospital_thresholds', JSON.stringify(nextOverrides));
      window.dispatchEvent(new Event('ibhar_thresholds_updated'));
      setSavedNotice(`Updated custom thresholds for ${id}`);
      setTimeout(() => setSavedNotice(null), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetHospital = (id: string) => {
    const nextOverrides = { ...thresholdOverrides };
    delete nextOverrides[id];
    setThresholdOverrides(nextOverrides);
    try {
      localStorage.setItem('ibhar_hospital_thresholds', JSON.stringify(nextOverrides));
      window.dispatchEvent(new Event('ibhar_thresholds_updated'));
      setSavedNotice(`Reset ${id} to system default`);
      setTimeout(() => setSavedNotice(null), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetAllToDefaults = () => {
    setThresholdOverrides({});
    setGlobalThreshold(DEFAULT_GLOBAL_THRESHOLDS);
    try {
      localStorage.removeItem('ibhar_hospital_thresholds');
      localStorage.removeItem('ibhar_global_threshold');
      window.dispatchEvent(new Event('ibhar_thresholds_updated'));
      setSavedNotice('All thresholds reset to project defaults');
      setTimeout(() => setSavedNotice(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-6xl mx-auto pb-12"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
            HOSPITAL REFRESH RATE & STATUS RULES
            <Sliders className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-sans mt-1">
            Configure dynamic overall default conditions (30m, 60m, 90m, 180m, 270m) or customize per-hospital rules
          </p>
        </div>

        {/* Global Reset Action */}
        <button
          onClick={handleResetAllToDefaults}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-slate-400" />
          <span>Reset All Defaults</span>
        </button>
      </div>

      {/* Notice Banner */}
      <AnimatePresence>
        {savedNotice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-400 dark:border-emerald-700 rounded-2xl flex items-center justify-between shadow-md"
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{savedNotice}</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 uppercase font-black tracking-wider">
              SAVED LOCALLY
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Global Default Threshold Controller */}
      <Card className="p-5 sm:p-6 border-2 border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 dark:from-blue-950/50 dark:via-slate-900 dark:to-indigo-950/30 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-100 dark:border-blue-900/60 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Sliders className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-heading font-black text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                Dynamic Overall Default Conditions
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                  SYSTEM-WIDE
                </span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                Applies dynamically to all hospitals unless a unique custom rule is assigned below
              </p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1">Presets:</span>
            <button
              onClick={() => handleApplyGlobalPreset(30, 60, 'Standard 30/60m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                globalThreshold.receivingMaxMinutes === 30 && globalThreshold.delayedMaxMinutes === 60
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              30 / 60 Min
            </button>
            <button
              onClick={() => handleApplyGlobalPreset(60, 90, 'Extended 60/90m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                globalThreshold.receivingMaxMinutes === 60 && globalThreshold.delayedMaxMinutes === 90
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              60 / 90 Min
            </button>
            <button
              onClick={() => handleApplyGlobalPreset(90, 120, 'Long 90/120m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                globalThreshold.receivingMaxMinutes === 90 && globalThreshold.delayedMaxMinutes === 120
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              90 / 120 Min
            </button>
            <button
              onClick={() => handleApplyGlobalPreset(90, 180, 'Cadence 90/180m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                globalThreshold.receivingMaxMinutes === 90 && globalThreshold.delayedMaxMinutes === 180
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              90 / 180 Min
            </button>
            <button
              onClick={() => handleApplyGlobalPreset(90, 270, 'Wide Window 90/270m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                globalThreshold.receivingMaxMinutes === 90 && globalThreshold.delayedMaxMinutes === 270
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-400/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              90 / 270 Min
            </button>
            <button
              onClick={() => handleApplyGlobalPreset(180, 270, 'Extended 180/270m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                globalThreshold.receivingMaxMinutes === 180 && globalThreshold.delayedMaxMinutes === 270
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              180 / 270 Min
            </button>
          </div>
        </div>

        {/* 3 Interactive Global Condition Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* 1. Receiving (Healthy) */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border-2 border-emerald-200 dark:border-emerald-800/60 shadow-sm flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Receiving Max
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                HEALTHY
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-100 dark:border-emerald-900/40">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Delay ≤</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={globalThreshold.receivingMaxMinutes}
                  onChange={(e) => handleUpdateGlobalThreshold('receivingMaxMinutes', parseInt(e.target.value, 10) || 1)}
                  className="w-20 p-1.5 text-center font-mono font-black text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border-2 border-emerald-400 dark:border-emerald-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-xs font-mono font-bold text-slate-500">mins</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Data arrives within expected cadence.
            </p>
          </div>

          {/* 2. Delayed */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border-2 border-amber-200 dark:border-amber-800/60 shadow-sm flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Delayed Window
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                WARNING
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-100 dark:border-amber-900/40">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Range</span>
              <div className="flex items-center gap-1 font-mono font-black text-sm text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                <span>{globalThreshold.receivingMaxMinutes + 1}m – {globalThreshold.delayedMaxMinutes}m</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Transition window before critical escalation.
            </p>
          </div>

          {/* 3. Critical Alert (Now Directly Editable) */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border-2 border-rose-200 dark:border-rose-800/60 shadow-sm flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Critical Alert
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md">
                ACTION REQ
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-rose-100 dark:border-rose-900/40">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Delay &gt;</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={globalThreshold.receivingMaxMinutes + 1}
                  max={1440}
                  value={globalThreshold.delayedMaxMinutes}
                  onChange={(e) => handleUpdateGlobalThreshold('delayedMaxMinutes', parseInt(e.target.value, 10) || (globalThreshold.receivingMaxMinutes + 1))}
                  className="w-20 p-1.5 text-center font-mono font-black text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border-2 border-rose-400 dark:border-rose-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="text-xs font-mono font-bold text-slate-500">mins</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Delays exceeding this time trigger Critical status.
            </p>
          </div>
        </div>
      </Card>

      {/* Hospital List & Override Matrix */}
      <Card className="p-5 sm:p-6 border-2 border-slate-200/80 dark:border-slate-800 shadow-md space-y-4">
        {/* Controls Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hospital code or name..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterCustomOnly(prev => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border-2 ${
                filterCustomOnly
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-400'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Custom Rules Only ({Object.keys(thresholdOverrides).length})</span>
            </button>
          </div>
        </div>

        {/* Hospital Threshold Cards */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-1">
          {filteredHospitals.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold text-sm">
              No hospitals matching the search query.
            </div>
          ) : (
            filteredHospitals.map(h => {
              const custom = thresholdOverrides[h.id];
              const config = custom || globalThreshold;
              const isOverridden = Boolean(custom);

              return (
                <div
                  key={h.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 px-2 rounded-xl"
                >
                  {/* Left Hospital Details */}
                  <div className="min-w-[240px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                        {h.id}
                      </span>
                      {isOverridden ? (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300">
                          Custom Rule
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                          Default
                        </span>
                      )}
                    </div>
                    <h4 className="font-heading font-black text-sm sm:text-base text-slate-900 dark:text-white mt-1">
                      {h.name}
                    </h4>
                  </div>

                  {/* Middle Threshold Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
                    {/* Receiving Threshold */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <div>
                          <p className="text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                            Receiving Max
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">Delay ≤ X min</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={config.receivingMaxMinutes}
                          onChange={(e) => handleUpdateHospitalThreshold(h.id, 'receivingMaxMinutes', parseInt(e.target.value, 10) || 1)}
                          className="w-16 p-1 text-center font-mono font-black text-xs rounded-lg bg-white dark:bg-slate-800 border-2 border-emerald-300 dark:border-emerald-700 text-slate-900 dark:text-white focus:outline-none"
                        />
                        <span className="text-xs font-mono font-bold text-slate-400">m</span>
                      </div>
                    </div>

                    {/* Critical Threshold */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                        <div>
                          <p className="text-[11px] font-black uppercase text-rose-700 dark:text-rose-300">
                            Critical Threshold
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">Delay &gt; Y min</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={2}
                          max={1440}
                          value={config.delayedMaxMinutes}
                          onChange={(e) => handleUpdateHospitalThreshold(h.id, 'delayedMaxMinutes', parseInt(e.target.value, 10) || 2)}
                          className="w-16 p-1 text-center font-mono font-black text-xs rounded-lg bg-white dark:bg-slate-800 border-2 border-rose-300 dark:border-rose-700 text-slate-900 dark:text-white focus:outline-none"
                        />
                        <span className="text-xs font-mono font-bold text-slate-400">m</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Reset Action */}
                  {isOverridden && (
                    <button
                      onClick={() => handleResetHospital(h.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </motion.div>
  );
};

export default HospitalRefreshRatePage;
