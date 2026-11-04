export interface Hospital {
  id: string;
  name: string;
  city: string;
  status: 'healthy' | 'delayed' | 'warning' | 'critical' | 'offline' | 'unknown';
  lastDataReceived: string;
  expectedDataTime: string;
  delayMinutes: number;
  dataFrequency: number;
  dataVolumeMB: number;
  recordsReceived: number;
  recordsAvailable?: number;
  recordsProcessed?: number;
  errorCount?: number;
  serviceStatus: 'running' | 'stopped' | 'degraded';
  dataQuality: number;
  awsCost: number;
  ipAddress: string;
  region: string;
  hospitalCode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Encounter {
  id: number | string;
  hospital_id: string;
  patient_uhid: string;
  patient_name?: string;
  visit_type?: string;
  specialty_name?: string;
  admission_date?: string;
  created_at?: string;
  gender?: string;
  age?: number;
  encounter_no?: string;
  visit_date?: string;
  area_name?: string;
  bed?: string;
  clinician_name?: string;
}

export interface Discharge {
  id: number | string;
  hospital_id: string;
  patient_uhid: string;
  encounter_no?: string;
  discharge_date?: string;
  discharge_type?: string;
  discharged_by_user_name?: string;
  created_at?: string;
}

export interface DataIngestionLog {
  id: number | string;
  hospital_id: string;
  data_type?: string;
  received_at?: string;
  expected_at?: string;
  record_count: number;
  status: string;
  response_time_ms?: number;
  data_size_mb?: number;
  error_message?: string;
  created_at?: string;
}

export interface Alert {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  type: 'critical' | 'warning' | 'info' | 'resolved' | string;
  title: string;
  message: string;
  timestamp: string;
  lastReceived?: string;
  expectedTime?: string;
  category?: string;
  isRead: boolean;
  severity?: string;
  status?: string;
  insert_sql?: string | null;
  update_sql?: string | null;
  general_sql?: string | null;
}

export interface TimeSeriesPoint {
  time: string;
  volumeMB: number;
  frequencyScore?: number;
  avgDelayMin?: number;
  dataQuality?: number;
  count?: number;
  records?: number;
  errorCount?: number;
}

export interface DataOperationItem {
  name: string;
  percentage: number;
  count: number;
  colorLight: string;
  colorDark: string;
}

export interface TopHospitalMetric {
  id: string;
  name: string;
  volumeMB: number;
  quality: number;
}

export interface ReportItem {
  id: string;
  title: string;
  type: 'pdf' | 'csv' | 'excel';
  date?: string;
  size?: string;
  hospitalId?: string;
  iconName?: string;
  recordCount?: number;
  fileSize?: string;
  lastGenerated?: string;
  description?: string;
}

export interface ReportFilters {
  date_preset?: 'today' | '7days' | '30days' | 'custom' | string;
  start_date?: string;
  end_date?: string;
  hospital_id?: string;
  data_type?: string;
  status?: string;
  severity?: string;
}

export interface ReportDetailData {
  report_title: string;
  generated_at: string;
  filters_applied: ReportFilters;
  summary: Record<string, any>;
  breakdown?: any[];
  rows?: any[];
  trend_points?: any[];
  chart_points?: any[];
  message?: string | null;
}


export interface DashboardMetrics {
  total_hospitals: number;
  active_hospitals: number;
  healthy: number;
  delayed: number;
  warning?: number;
  critical?: number;
  offline?: number;
  total_encounters: number;
  total_discharges: number;
  active_alerts: number;
  latest_ingestion?: DataIngestionLog | null;
  average_response_time_ms?: number;
  total_data_volume_mb?: number;
  hourly_volume_trend?: TimeSeriesPoint[];
  recent_alerts?: Alert[];
}

export interface IntegrationTrendPoint {
  timestamp: string;
  time_label: string;
  record_count: number;
  data_size_mb: number;
  response_time_ms: number;
}

export interface HospitalIntegrationTrend {
  hospital_id: string;
  hospital_name: string;
  points: IntegrationTrendPoint[];
}

export interface HealthIssueItem {
  type: 'LATENCY' | 'VOLUME' | 'CONNECTION';
  severity: 'WARNING' | 'CRITICAL';
  value: string | number;
  baseline: string | number;
  deviation?: string;
  message: string;
}

export interface HealthTrendPoint {
  timestamp: string;
  time_label: string;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  health_score: number;
  response_time_ms: number;
  record_count: number;
  data_size_mb: number;
  issues: HealthIssueItem[];
}

export interface HospitalHealthTrend {
  hospital_id: string;
  hospital_name: string;
  points: HealthTrendPoint[];
}

export interface IntegrationHealthLog {
  id: number | string;
  hospital_id: string;
  hospital_name: string;
  hospital_code?: string;
  data_type: string;
  data_structure?: string;
  service_name?: string;
  received_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_seconds?: number;
  expected_at?: string | null;
  delay_minutes: number;
  record_count: number;
  records_available?: number;
  records_processed?: number;
  data_size_mb: number;
  response_time_ms: number;
  status: string;
  integration_status: 'RECEIVING' | 'DELAYED' | 'FAILED' | 'UNKNOWN';
  error_message?: string | null;
  created_at?: string | null;
  trend_points?: IntegrationTrendPoint[];
  health_trend_points?: HealthTrendPoint[];
}

export interface IntegrationHealthSummary {
  total_hospitals: number;
  receiving: number;
  delayed: number;
  failed: number;
  unknown: number;
  total_records: number;
  total_volume_mb: number;
  average_response_time_ms: number;
  average_duration_seconds?: number;
  latest_start_time?: string | null;
  latest_end_time?: string | null;
  last_successful_ingestion?: string | null;
  general_process_records?: number;
  vamr_process_records?: number;
  general_process_entities?: number;
  vamr_process_entities?: number;
}

export interface IntegrationHealthResponse {
  data: IntegrationHealthLog[];
  summary: IntegrationHealthSummary;
  issues: IntegrationHealthLog[];
  recent_activity: IntegrationHealthLog[];
}

export interface LiveError {
  id?: string;
  data_structure: string;
  error_text: string;
  time: string | null;
  is_acknowledged?: boolean;
  insert_sql?: string | null;
  update_sql?: string | null;
  general_sql?: string | null;
}

export interface LiveDataStructure {
  name: string;
  last_synced_at: string | null;
  status: string;
}

export interface LiveHospital {
  hospital_code: string;
  hospital_name: string | null;
  status: 'healthy' | 'delayed' | 'error' | 'idle';
  last_synced_at: string | null;
  success_count: number;
  error_count: number;
  records_available?: number;
  records_processed?: number;
  completeness: number;
  latest_errors: LiveError[];
  per_data_structure: LiveDataStructure[];
}

export interface LiveDashboard {
  hospitals: LiveHospital[];
  hospital_count: number;
}

