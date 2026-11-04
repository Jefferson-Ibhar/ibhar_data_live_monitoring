import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  Hospital,
  Alert,
  TimeSeriesPoint,
  Encounter,
  Discharge,
  DataIngestionLog,
  DashboardMetrics,
  IntegrationHealthResponse,
  IntegrationHealthLog,
  LiveDashboard,
  LiveHospital
} from '../types';
import { apiService } from '../services/api';
import { computeDelayMinutes, getHospitalLiveStatus, parseDateComponents, getStoredThresholds } from '../utils/monitoring';

export type TimeRange = 'today' | 'yesterday' | '7days' | '30days' | 'custom';

export type DataSourceMode = 'LIVE_API' | 'LOCAL_DB' | 'MOCK';

interface MonitoringContextType {
  hospitals: Hospital[];
  alerts: Alert[];
  timeSeries: TimeSeriesPoint[];
  encounters: Encounter[];
  discharges: Discharge[];
  ingestionLogs: DataIngestionLog[];
  dashboardMetrics: DashboardMetrics | null;
  integrationHealthData: IntegrationHealthResponse | null;
  
  // Live REST API Source of Truth (Task 7)
  liveDashboard: LiveDashboard | null;
  liveLoading: boolean;
  liveError: string | null;
  
  lastUpdated: string;
  autoRefresh: boolean;
  timeRange: TimeRange;
  isLoading: boolean;
  isBackendConnected: boolean;
  apiError: string | null;
  toggleAutoRefresh: () => void;
  manualRefresh: () => void;
  setTimeRange: (range: TimeRange) => void;
  markAlertAsRead: (alertId: string) => void;
  getHospitalById: (id: string) => Hospital | undefined;
  unreadAlertsCount: number;
  isSimulatingUpdate: boolean;
  thresholdVersion: number;
  refreshIntervalMinutes: number;
  setRefreshIntervalMinutes: (mins: number) => void;
  importHospitals: (newHospitals: Hospital[]) => void;
}

const MonitoringContext = createContext<MonitoringContextType | undefined>(undefined);

/**
 * Helper to map LiveHospital telemetry from the external REST API to the UI's Hospital model
 */
function mapLiveHospitalToUiHospital(live: LiveHospital): Hospital {
  const { customThresholds, globalThresh } = getStoredThresholds();
  const threshold = customThresholds[live.hospital_code || ''] || globalThresh;
  const isCritical = live.status === 'error' || (live.error_count !== undefined && live.error_count > 0);
  const delayMinutes = live.last_synced_at ? computeDelayMinutes(live.last_synced_at) : (live.status === 'delayed' ? (threshold.receivingMaxMinutes + 5) : 0);
  const statusInfo = getHospitalLiveStatus(delayMinutes, threshold);
  
  let mappedStatus: Hospital['status'] = 'healthy';
  if (isCritical || statusInfo.label === 'CRITICAL') {
    mappedStatus = 'critical';
  } else if (statusInfo.label === 'DELAYED') {
    mappedStatus = 'delayed';
  }

  let formattedTime = 'Just now';
  if (live.last_synced_at) {
    try {
      const dt = parseDateComponents(live.last_synced_at) || new Date(live.last_synced_at);
      formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      formattedTime = live.last_synced_at;
    }
  }

  return {
    id: live.hospital_code,
    name: live.hospital_name || live.hospital_code,
    city: 'Live Node',
    status: mappedStatus,
    lastDataReceived: formattedTime,
    expectedDataTime: '30 min interval',
    delayMinutes: delayMinutes,
    dataFrequency: 30,
    dataVolumeMB: parseFloat((live.completeness * 14.2).toFixed(1)),
    recordsReceived: live.records_processed ?? live.success_count ?? 0,
    recordsAvailable: live.records_available ?? live.records_processed ?? 0,
    recordsProcessed: live.records_processed ?? live.success_count ?? 0,
    errorCount: live.error_count ?? 0,
    serviceStatus: isCritical ? 'stopped' : 'running',
    dataQuality: Math.round((live.completeness ?? 1) * 100),
    awsCost: 800,
    ipAddress: '10.142.0.1',
    region: 'ap-south-1',
    hospitalCode: live.hospital_code,
  };
}


/**
 * Helper to retrieve and persist last known non-zero data ingestion per hospital in browser memory (Zero DB overhead)
 */
export function getPersistedNonZeroMap(): Record<string, { received_at: string; record_count: number; records_processed: number }> {
  try {
    const saved = localStorage.getItem('ibhar_last_non_zero_sync');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function savePersistedNonZeroMap(map: Record<string, { received_at: string; record_count: number; records_processed: number }>): void {
  try {
    localStorage.setItem('ibhar_last_non_zero_sync', JSON.stringify(map));
  } catch {}
}

export function mergeWithPersistedNonZeroRecords(records: IntegrationHealthLog[]): IntegrationHealthLog[] {
  const nonZeroMap = getPersistedNonZeroMap();
  let mapUpdated = false;

  const merged = records.map((h: IntegrationHealthLog) => {
    const hId = (h.hospital_id || h.hospital_code || '').trim();
    if (!hId) return h;

    const proc = h.record_count ?? h.records_processed ?? 0;
    const rawTs = h.received_at || h.start_time;

    if (proc > 0 && rawTs) {
      // New incoming data with rows > 0: update persisted state
      nonZeroMap[hId] = {
        received_at: rawTs,
        record_count: proc,
        records_processed: proc
      };
      mapUpdated = true;
      return h;
    }

    // If 0 rows in this cycle, check if we have a preserved non-zero record in UI memory
    if (nonZeroMap[hId]) {
      return {
        ...h,
        received_at: nonZeroMap[hId].received_at,
        start_time: nonZeroMap[hId].received_at,
        record_count: nonZeroMap[hId].record_count,
        records_processed: nonZeroMap[hId].records_processed,
      };
    }

    return h;
  });

  if (mapUpdated) {
    savePersistedNonZeroMap(nonZeroMap);
  }

  return merged;
}

function getDateRangeForTimeRange(range: TimeRange): { start_date?: string; end_date?: string } {
  const now = new Date();
  const formatYMD = (d: Date) => d.toISOString().split('T')[0];

  if (range === 'today') {
    const todayStr = formatYMD(now);
    return { start_date: todayStr, end_date: todayStr };
  }
  if (range === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = formatYMD(yest);
    return { start_date: yestStr, end_date: yestStr };
  }
  if (range === '7days') {
    const past7 = new Date(now);
    past7.setDate(past7.getDate() - 7);
    return { start_date: formatYMD(past7), end_date: formatYMD(now) };
  }
  if (range === '30days') {
    const past30 = new Date(now);
    past30.setDate(past30.getDate() - 30);
    return { start_date: formatYMD(past30), end_date: formatYMD(now) };
  }
  return {};
}

export const MonitoringProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [discharges, setDischarges] = useState<Discharge[]>([]);
  const [ingestionLogs, setIngestionLogs] = useState<DataIngestionLog[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [integrationHealthData, setIntegrationHealthData] = useState<IntegrationHealthResponse | null>(null);

  // Live REST API state
  const [liveDashboard, setLiveDashboard] = useState<LiveDashboard | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [refreshIntervalMinutes, setRefreshIntervalMinutesState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ibhar_refresh_interval_mins');
      return saved ? parseInt(saved, 10) : 5;
    } catch {
      return 5;
    }
  });

  const setRefreshIntervalMinutes = (mins: number) => {
    setRefreshIntervalMinutesState(mins);
    try {
      localStorage.setItem('ibhar_refresh_interval_mins', String(mins));
    } catch (e) {
      console.error('Failed to save refresh interval to localStorage', e);
    }
  };

  const [thresholdVersion, setThresholdVersion] = useState<number>(0);

  useEffect(() => {
    const handleThresholdChange = () => {
      setThresholdVersion(prev => prev + 1);
    };

    window.addEventListener('ibhar_thresholds_updated', handleThresholdChange);
    window.addEventListener('storage', handleThresholdChange);

    return () => {
      window.removeEventListener('ibhar_thresholds_updated', handleThresholdChange);
      window.removeEventListener('storage', handleThresholdChange);
    };
  }, []);

  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSimulatingUpdate, setIsSimulatingUpdate] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);

  const [lastUpdated, setLastUpdated] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const loadDataFromApi = useCallback(async () => {

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setLiveLoading(true);


    try {
      const dateFilters = getDateRangeForTimeRange(timeRange);

      const [
        liveRes,
        hospitalsRes,
        analyticsRes,
        dashboardRes,
        encountersRes,
        dischargesRes,
        ingestionRes,
        healthRes,
        serverAckIds
      ] = await Promise.all([
        apiService.getLiveDashboard(),
        apiService.getHospitals(),
        apiService.getAnalytics(),
        apiService.getDashboard(),
        apiService.getEncounters(),
        apiService.getDischarges(),
        apiService.getIngestionLogs(),
        apiService.getIntegrationHealth(dateFilters),
        apiService.getAcknowledgedAlertIds().catch(() => [])
      ]);

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Update Live REST API data
      if (liveRes && liveRes.hospitals) {
        setLiveDashboard(liveRes);
        setLiveError(null);
      }

      let processedHealthRes = healthRes;
      if (healthRes && healthRes.data && healthRes.data.length > 0) {
        const mergedData = mergeWithPersistedNonZeroRecords(healthRes.data);
        processedHealthRes = {
          ...healthRes,
          data: mergedData,
        };
      }

      /* 
       * DATA SOURCE SELECTION:
       * Primary Source of Truth: Live REST API (liveRes / processedHealthRes)
       * Fallback: Local Database (hospitalsRes)
       */
      if (processedHealthRes && processedHealthRes.data && processedHealthRes.data.length > 0) {
        const { customThresholds, globalThresh } = getStoredThresholds();
        const mappedLiveHospitals: Hospital[] = processedHealthRes.data.map((h: IntegrationHealthLog) => {
          const delay = computeDelayMinutes(h.received_at || h.start_time, h.delay_minutes);
          const threshold = customThresholds[h.hospital_id || h.hospital_code || ''] || globalThresh;
          const statusInfo = getHospitalLiveStatus(delay, threshold);
          const isCrit = statusInfo.label === 'CRITICAL' || h.status === 'ERROR' || h.integration_status === 'FAILED';
          const isDel = statusInfo.label === 'DELAYED';

          let formattedTime = 'Just now';
          const rawTs = h.received_at || h.start_time;
          if (rawTs) {
            try {
              const dt = parseDateComponents(rawTs) || new Date(rawTs);
              formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch {
              formattedTime = rawTs;
            }
          }

          return {
            id: h.hospital_id || h.hospital_code,
            name: h.hospital_name || h.hospital_code,
            city: 'Live Node',
            status: isCrit ? 'critical' : isDel ? 'delayed' : 'healthy',
            lastDataReceived: formattedTime,
            expectedDataTime: '30 min interval',
            delayMinutes: delay,
            dataFrequency: 30,
            dataVolumeMB: h.data_size_mb || 0,
            recordsReceived: h.record_count ?? h.records_processed ?? 0,
            recordsAvailable: h.records_available ?? h.record_count ?? 0,
            recordsProcessed: h.record_count ?? h.records_processed ?? 0,
            errorCount: isCrit ? 1 : 0,
            serviceStatus: isCrit ? 'stopped' : 'running',
            dataQuality: isCrit ? 50 : 100,
            awsCost: 800,
            ipAddress: '10.142.0.1',
            region: 'ap-south-1',
            hospitalCode: h.hospital_code || h.hospital_id,
          };
        });
        setHospitals(mappedLiveHospitals);
        setIsBackendConnected(true);
        setApiError(null);
      } else if (liveRes && liveRes.hospitals && liveRes.hospitals.length > 0) {

        // Source of truth: Live REST API
        const mappedLiveHospitals = liveRes.hospitals.map(mapLiveHospitalToUiHospital);
        setHospitals(mappedLiveHospitals);
        setIsBackendConnected(true);
        setApiError(null);
      } else if (hospitalsRes !== null) {
        // Fallback: DB-backed hospitals
        setHospitals(hospitalsRes);
        setIsBackendConnected(true);
        setApiError(null);
      } else {
        setIsBackendConnected(false);
        setApiError('Unable to connect to Django API backend (http://localhost:8000/api/). Please verify backend server is running.');
      }

      // Alerts stream: Live REST API sync errors only (past Supabase alerts removed)
      // Limit to 20 days max retention (older alerts are purged/deleted)
      const liveAlerts: Alert[] = [];
      const nowMs = Date.now();
      const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;
      const serverAckSet = new Set<string>(Array.isArray(serverAckIds) ? serverAckIds : []);
      // Baseline timestamp for existing alerts (all existing alerts on or before this time are acknowledged)
      const BASELINE_ACK_TIMESTAMP = new Date('2026-11-04T12:05:00Z').getTime();

      if (liveRes && liveRes.hospitals) {
        liveRes.hospitals.forEach((h, hIdx) => {
          (h.latest_errors || []).forEach((err, errIdx) => {
            const rawTime = err.time;
            let parsedTime: Date | null = null;
            if (rawTime) {
              parsedTime = parseDateComponents(rawTime) || new Date(rawTime);
              if (parsedTime && !isNaN(parsedTime.getTime())) {
                const ageMs = nowMs - parsedTime.getTime();
                if (ageMs > TWENTY_DAYS_MS) {
                  // Discard/purge alerts older than 20 days
                  return;
                }
              }
            }

            const alertId = `live-alert-${h.hospital_code}-${hIdx}-${errIdx}`;
            const timeMs = parsedTime && !isNaN(parsedTime.getTime()) ? parsedTime.getTime() : 0;
            // Existing alerts on or before the baseline deployment are marked acknowledged
            const isPreExisting = timeMs > 0 && timeMs <= BASELINE_ACK_TIMESTAMP;
            const isAck = isPreExisting || serverAckSet.has(alertId) || Boolean(err.is_acknowledged);

            liveAlerts.push({
              id: alertId,
              hospitalId: h.hospital_code,
              hospitalName: h.hospital_name || h.hospital_code,
              type: 'critical',
              title: `Live Sync Error: ${err.data_structure || 'External API'}`,
              message: err.error_text,
              timestamp: err.time || new Date().toISOString(),
              lastReceived: h.last_synced_at || '',
              category: err.data_structure || 'IN_PATIENT_INFO',
              isRead: isAck,
              severity: 'CRITICAL',
              status: isAck ? 'ACKNOWLEDGED' : 'ACTIVE',
              insert_sql: err.insert_sql,
              update_sql: err.update_sql,
              general_sql: err.general_sql,
            });
          });
        });
      }

      setAlerts(liveAlerts);
      
      // Aggregate live API record counts, latency, and health scores across all hospital telemetry feeds
      if (healthRes && healthRes.data && healthRes.data.length > 0) {
        const timeMap = new Map<string, {
          records: number;
          responseTimeSum: number;
          healthScoreSum: number;
          errorCount: number;
          totalCount: number;
        }>();

        for (const h of healthRes.data) {
          for (const tp of (h.trend_points || [])) {
            const label = tp.time_label || '00:00';
            const curr = timeMap.get(label) || {
              records: 0,
              responseTimeSum: 0,
              healthScoreSum: 0,
              errorCount: 0,
              totalCount: 0
            };
            curr.records += tp.record_count ?? 0;
            curr.responseTimeSum += tp.response_time_ms ?? 75;
            curr.totalCount += 1;
            timeMap.set(label, curr);
          }

          for (const hp of (h.health_trend_points || [])) {
            const label = hp.time_label || '00:00';
            const curr = timeMap.get(label) || {
              records: 0,
              responseTimeSum: 0,
              healthScoreSum: 0,
              errorCount: 0,
              totalCount: 0
            };
            curr.healthScoreSum += hp.health_score ?? (hp.status === 'CRITICAL' ? 30 : hp.status === 'WARNING' ? 70 : 98);
            if (hp.status === 'CRITICAL' || hp.status === 'WARNING' || (hp.issues && hp.issues.length > 0)) {
              curr.errorCount += 1;
            }
            timeMap.set(label, curr);
          }
        }

        if (timeMap.size > 0) {
          const liveSeries: TimeSeriesPoint[] = Array.from(timeMap.entries()).map(([time, data]) => {
            const count = data.records;
            const pointsCount = Math.max(1, data.totalCount);
            const avgResp = data.responseTimeSum / pointsCount;
            const avgHealth = data.healthScoreSum > 0 ? (data.healthScoreSum / pointsCount) : 98;
            const errorRatio = data.errorCount / pointsCount;
            
            // Frequency Score: 92% - 100%
            const freqScore = Math.min(100, Math.max(85, Math.round(98 - (errorRatio * 15))));
            // Delay in minutes: 2 - 8 min
            const avgDelay = Math.max(1, Math.round(avgResp > 500 ? avgResp / 1000 / 60 : 3 + (errorRatio * 4)));
            // Data Quality Integrity: 90% - 100%
            const quality = Math.min(100, Math.max(88, Math.round(avgHealth)));

            return {
              time,
              volumeMB: count,
              count: count,
              records: count,
              frequencyScore: freqScore,
              avgDelayMin: avgDelay,
              dataQuality: quality,
              errorCount: data.errorCount
            };
          });

          // Sort chronologically by time label
          liveSeries.sort((a, b) => a.time.localeCompare(b.time));

          setTimeSeries(liveSeries);
        } else if (dashboardRes?.hourly_volume_trend && dashboardRes.hourly_volume_trend.length > 0) {
          setTimeSeries(dashboardRes.hourly_volume_trend);
        } else {
          setTimeSeries(analyticsRes?.hourly || []);
        }
      } else if (dashboardRes?.hourly_volume_trend && dashboardRes.hourly_volume_trend.length > 0) {
        setTimeSeries(dashboardRes.hourly_volume_trend);
      } else {
        setTimeSeries(analyticsRes?.hourly || []);
      }

      setDashboardMetrics(dashboardRes);
      setEncounters(encountersRes || []);
      setDischarges(dischargesRes || []);
      setIngestionLogs(ingestionRes || []);
      if (processedHealthRes) {
        setIntegrationHealthData(processedHealthRes);
      }
      setLastUpdated(timeStr);

    } catch (error: any) {
      console.error('[Monitoring] Error loading live monitoring data:', error);
      setIsBackendConnected(false);
      setApiError('Unable to load live telemetry data from Django backend API.');
    } finally {
      setIsLoading(false);
      setLiveLoading(false);
      isFetchingRef.current = false;
    }

  }, [timeRange, thresholdVersion]);

  useEffect(() => {
    loadDataFromApi();
  }, [loadDataFromApi]);

  const performLiveUpdate = useCallback(() => {
    setIsSimulatingUpdate(true);
    loadDataFromApi().finally(() => {
      setTimeout(() => setIsSimulatingUpdate(false), 500);
    });
  }, [loadDataFromApi]);

  // Dynamic polling interval for live external REST API monitoring
  useEffect(() => {
    if (!autoRefresh) return;
    const intervalMs = (refreshIntervalMinutes > 0 ? refreshIntervalMinutes : 5) * 60 * 1000;
    const interval = setInterval(() => {
      performLiveUpdate();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMinutes, performLiveUpdate]);

  const toggleAutoRefresh = () => setAutoRefresh(prev => !prev);
  const manualRefresh = () => performLiveUpdate();

  const markAlertAsRead = async (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isRead: true, status: 'ACKNOWLEDGED' } : a));
    // Persist global server-side acknowledgment across all browsers/TVs
    await apiService.acknowledgeAlert(alertId);
    if (!alertId.startsWith('live-alert-')) {
      await apiService.markAlertAsRead(alertId);
    }
  };

  const getHospitalById = (id: string) => {
    return hospitals.find(h => h.id.toLowerCase() === id.toLowerCase());
  };

  const unreadAlertsCount = alerts.filter(a => !a.isRead).length;

  const importHospitals = useCallback((newHospitals: Hospital[]) => {
    setHospitals(prev => [...prev, ...newHospitals]);
  }, []);

  return (
    <MonitoringContext.Provider
      value={{
        hospitals,
        alerts,
        timeSeries,
        encounters,
        discharges,
        ingestionLogs,
        dashboardMetrics,
        integrationHealthData,
        liveDashboard,
        liveLoading,
        liveError,
        lastUpdated,
        autoRefresh,
        thresholdVersion,
        refreshIntervalMinutes,
        setRefreshIntervalMinutes,
        timeRange,
        isLoading,
        isBackendConnected,
        apiError,
        toggleAutoRefresh,
        manualRefresh,
        setTimeRange,
        markAlertAsRead,
        getHospitalById,
        unreadAlertsCount,
        isSimulatingUpdate,
        importHospitals
      }}
    >
      {children}
    </MonitoringContext.Provider>
  );
};

export const useMonitoring = (): MonitoringContextType => {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error('useMonitoring must be used within a MonitoringProvider');
  }
  return context;
};

