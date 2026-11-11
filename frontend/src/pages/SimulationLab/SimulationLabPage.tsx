import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMonitoring } from '../../hooks/useMonitoring';
import { Card } from '../../components/common/Card';
import { apiService } from '../../services/api';
import {
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Sparkles,
  Info,
  Server,
  Plus,
  RefreshCw,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import type { Hospital } from '../../types';

interface ExcelRow {
  id?: string;
  HospitalName: string;
  HospitalType: string;
  Location: string;
  APIEndpoint: string;
  tempId: string; // for internal react keys
}

interface ValidationResult {
  row: ExcelRow;
  isValid: boolean;
  errors: string[];
  generatedId: string;
}

export const SimulationLabPage: React.FC = () => {
  const { hospitals, importHospitals } = useMonitoring();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [uploadedRows, setUploadedRows] = useState<ExcelRow[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isSimulationRunning, setIsSimulationRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'database' | 'simulation'>('upload');
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [fileName, setFileName] = useState<string>('');
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Helper to parse existing sequential HOSPXXXXXX IDs and find the next number
  const nextIdSequence = useMemo(() => {
    let maxSeq = 0;
    hospitals.forEach(h => {
      // Look for HOSP000001, etc.
      const match = h.id.match(/^HOSP(\d{6})$/);
      if (match) {
        const seqNum = parseInt(match[1], 10);
        if (seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });
    return maxSeq + 1;
  }, [hospitals]);

  // Validation Engine running asynchronously via Django with local fallback
  useEffect(() => {
    if (uploadedRows.length === 0) {
      setValidationResults([]);
      return;
    }

    let active = true;
    const runValidation = async () => {
      setIsValidating(true);
      const response = await apiService.validateExcel(uploadedRows);
      if (!active) return;

      if (response && response.results) {
        setValidationResults(response.results);
      } else {
        // Fallback to client-side logic if backend is unreachable
        const clientResults = uploadedRows.map((row, idx) => {
          const errors: string[] = [];
          if (!row.HospitalName?.trim()) errors.push('HospitalName is required.');
          if (!row.HospitalType?.trim()) errors.push('HospitalType is required.');
          if (!row.Location?.trim()) errors.push('Location is required.');
          if (!row.APIEndpoint?.trim()) {
            errors.push('APIEndpoint is required.');
          } else if (!row.APIEndpoint.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/i)) {
            errors.push('APIEndpoint must be a valid HTTP/HTTPS URL.');
          }

          const isValid = errors.length === 0;
          let generatedId = '';
          if (isValid) {
            let validBefore = 0;
            for (let j = 0; j < idx; j++) {
              const r = uploadedRows[j];
              const isRValid = r.HospitalName?.trim() && r.HospitalType?.trim() && r.Location?.trim() && r.APIEndpoint?.trim() && r.APIEndpoint.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/i);
              if (isRValid) {
                validBefore++;
              }
            }
            generatedId = `HOSP${(nextIdSequence + validBefore).toString().padStart(6, '0')}`;
          }

          return {
            row,
            isValid,
            errors,
            generatedId
          };
        });
        setValidationResults(clientResults);
      }
      setIsValidating(false);
    };

    runValidation();
    return () => {
      active = false;
    };
  }, [uploadedRows, nextIdSequence]);

  const summary = useMemo(() => {
    const total = validationResults.length;
    const valid = validationResults.filter(r => r.isValid).length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [validationResults]);

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
      alert('Please upload an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    simulateParsing(file.name);
  };

  const simulateParsing = (fileNm: string) => {
    const mockExcelRows: ExcelRow[] = [
      { HospitalName: 'Apollo Super Speciality', HospitalType: 'Tertiary Care', Location: 'Chennai', APIEndpoint: 'https://telemetry.apollo.in/live', tempId: Math.random().toString() },
      { HospitalName: 'Fortis Multi-Speciality', HospitalType: '', Location: 'Bengaluru', APIEndpoint: 'https://telemetry.fortis.com/live', tempId: Math.random().toString() }, // invalid
      { HospitalName: 'Manipal Heart Institute', HospitalType: 'Speciality Care', Location: 'Bengaluru', APIEndpoint: 'https://manipal.live/metrics', tempId: Math.random().toString() },
      { HospitalName: '', HospitalType: 'Clinic', Location: 'Delhi NCR', APIEndpoint: 'https://max-telemetry.io/data', tempId: Math.random().toString() }, // invalid
      { HospitalName: 'Max Healthcare', HospitalType: 'Tertiary Care', Location: 'Delhi NCR', APIEndpoint: 'https://max-telemetry.io/data', tempId: Math.random().toString() },
      { HospitalName: 'Aster Medcity', HospitalType: 'Multi-Speciality', Location: '', APIEndpoint: 'http://aster.co.in/stream', tempId: Math.random().toString() }, // invalid
      { HospitalName: 'KIMS General Hospital', HospitalType: 'Secondary Care', Location: 'Hyderabad', APIEndpoint: 'https://kims-stream.org/api/v1', tempId: Math.random().toString() },
      { HospitalName: 'MIOT International', HospitalType: 'Tertiary Care', Location: 'Chennai', APIEndpoint: 'invalid-url', tempId: Math.random().toString() } // invalid URL
    ];

    setFileName(fileNm);
    setUploadedRows(mockExcelRows);
    setImportSuccess(false);
  };

  const loadDemoData = () => {
    simulateParsing('demo_hospitals_upload.xlsx');
  };

  const handleConfirmImport = async () => {
    const validResults = validationResults.filter(r => r.isValid);
    if (validResults.length === 0) return;

    const validRowsToImport = validResults.map(r => r.row);
    const response = await apiService.confirmImport(validRowsToImport);

    let importedList: Hospital[] = [];
    if (response && response.hospitals) {
      importedList = response.hospitals.map((h: any) => ({
        id: h.hospital_id,
        name: h.name,
        city: h.city,
        status: h.status,
        lastDataReceived: h.last_data_received,
        expectedDataTime: h.expected_data_time,
        delayMinutes: h.delay_minutes,
        dataFrequency: h.data_frequency,
        dataVolumeMB: h.data_volume_mb,
        recordsReceived: h.records_received,
        serviceStatus: h.service_status,
        dataQuality: h.data_quality,
        awsCost: h.aws_cost,
        ipAddress: h.ip_address,
        region: h.region,
        apiEndpoint: h.api_endpoint
      }));
    } else {
      // Fallback client-side save logic
      importedList = validResults.map((v) => ({
        id: v.generatedId,
        name: `${v.row.HospitalName}, ${v.row.Location}`,
        city: v.row.Location,
        status: 'healthy',
        lastDataReceived: 'Just now',
        expectedDataTime: '12:00 PM',
        delayMinutes: 0,
        dataFrequency: 30,
        dataVolumeMB: 0,
        recordsReceived: 0,
        serviceStatus: 'running',
        dataQuality: 100,
        awsCost: 0,
        ipAddress: v.row.APIEndpoint.replace(/^https?:\/\//, '').split('/')[0],
        region: 'ap-south-1',
        apiEndpoint: v.row.APIEndpoint
      }));
    }

    importHospitals(importedList);
    setImportedCount(importedList.length);
    setImportSuccess(true);
    setUploadedRows([]);

    setTimeout(() => {
      setImportSuccess(false);
    }, 5000);
  };

  const handleClear = () => {
    setUploadedRows([]);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-6xl mx-auto pb-12"
    >
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-extrabold text-2xl text-textLight-heading dark:text-textNight-heading flex items-center gap-2">
            HOSPITAL DATA SIMULATION & PERFORMANCE LAB
          </h2>
          <p className="text-xs text-textLight-secondary dark:text-textNight-secondary font-sans mt-0.5">
            Configure telemetry schema parameters, ingest bulk registry spreadsheets, and control local mock simulation engines
          </p>
        </div>
        <Sparkles className="w-5 h-5 text-lightAccent-peach dark:text-nightAccent-peach shrink-0 hidden md:block" />
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b-2 border-slate-200 dark:border-slate-800 pb-px">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-5 py-3 text-xs font-cute uppercase font-bold tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'upload'
              ? 'border-lightAccent-peach dark:border-nightAccent-peach text-lightAccent-peach dark:text-nightAccent-peach'
              : 'border-transparent text-textLight-secondary dark:text-textNight-secondary hover:text-textLight-heading dark:hover:text-textNight-heading'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Excel Upload & ID Registry
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`px-5 py-3 text-xs font-cute uppercase font-bold tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'database'
              ? 'border-lightAccent-peach dark:border-nightAccent-peach text-lightAccent-peach dark:text-nightAccent-peach'
              : 'border-transparent text-textLight-secondary dark:text-textNight-secondary hover:text-textLight-heading dark:hover:text-textNight-heading'
          }`}
        >
          <Database className="w-4 h-4" />
          Schema & Constraints Inspector
        </button>
        <button
          onClick={() => setActiveTab('simulation')}
          className={`px-5 py-3 text-xs font-cute uppercase font-bold tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'simulation'
              ? 'border-lightAccent-peach dark:border-nightAccent-peach text-lightAccent-peach dark:text-nightAccent-peach'
              : 'border-transparent text-textLight-secondary dark:text-textNight-secondary hover:text-textLight-heading dark:hover:text-textNight-heading'
          }`}
        >
          <Server className="w-4 h-4" />
          Simulation Engine
        </button>
      </div>

      {/* Content Panels */}
      <AnimatePresence mode="wait">
        {activeTab === 'upload' && (
          <motion.div
            key="upload-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Success Alert Banner */}
            {importSuccess && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3.5"
              >
                <div className="p-2 bg-emerald-500 rounded-xl text-white">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading font-extrabold text-sm">Successfully Ingested Hospitals</h4>
                  <p className="text-xs opacity-90">
                    Imported <b>{importedCount}</b> valid hospital records with immutable sequential IDs. Check the main Hospitals tab to see them live.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Ingestion Console Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Drag & Drop Zone */}
              <div className="lg:col-span-1 space-y-4">
                <Card className="p-5 flex flex-col justify-between h-full min-h-[300px]">
                  <div>
                    <h3 className="font-heading font-black text-sm text-textLight-heading dark:text-textNight-heading mb-1.5">
                      Excel Source Upload
                    </h3>
                    <p className="text-xs text-textLight-secondary dark:text-textNight-secondary mb-4 leading-relaxed font-sans">
                      Upload the hospital registry configuration spreadsheet. The system will automatically skip invalid rows and assign unique alphanumeric identifiers starting from sequence <b>HOSP{nextIdSequence.toString().padStart(6, '0')}</b>.
                    </p>

                    {/* Drag and Drop Container */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                        dragActive
                          ? 'border-lightAccent-peach bg-lightAccent-peach/5 dark:border-nightAccent-peach dark:bg-nightAccent-peach/5'
                          : 'border-slate-200 hover:border-lightAccent-peach dark:border-slate-800 dark:hover:border-nightAccent-peach bg-nude-cardSec dark:bg-night-cardSoft'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileInput}
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                      />
                      <div className="p-3 rounded-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-lightAccent-peach dark:text-nightAccent-peach shadow-sm">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-textLight-heading dark:text-textNight-heading">
                          Drag file here or click to browse
                        </p>
                        <p className="text-[10px] text-textLight-secondary dark:text-textNight-secondary mt-0.5">
                          Supports .xlsx, .xls, .csv
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-2 mt-4">
                    <button
                      onClick={loadDemoData}
                      className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#EFE4DC] dark:border-[#1C3547] hover:border-lightAccent-peach dark:hover:border-nightAccent-peach text-xs font-bold text-textLight-heading dark:text-textNight-heading hover:text-lightAccent-peach dark:hover:text-nightAccent-peach transition-all cursor-pointer bg-white dark:bg-slate-900"
                    >
                      Load Sample Excel Data
                    </button>
                    {uploadedRows.length > 0 && (
                      <button
                        onClick={handleClear}
                        className="w-full py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                      >
                        Clear Ingestion Queue
                      </button>
                    )}
                  </div>
                </Card>
              </div>

              {/* Right Column: Validation Dashboard / Upload Specs */}
              <div className="lg:col-span-2 space-y-4">
                {uploadedRows.length === 0 ? (
                  <Card className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px] border-[#EFE4DC] dark:border-[#1C3547]">
                    <div className="p-4 rounded-2xl bg-nude-peachTint/50 dark:bg-night-cardElevated/50 text-lightAccent-peach dark:text-nightAccent-peach mb-3">
                      <FileSpreadsheet className="w-7 h-7" />
                    </div>
                    <h3 className="font-heading font-black text-base text-textLight-heading dark:text-textNight-heading">
                      No Records Uploaded
                    </h3>
                    <p className="text-xs text-textLight-secondary dark:text-textNight-secondary max-w-md mt-1 leading-relaxed font-sans">
                      Upload your Excel configuration or click <b>"Load Sample Excel Data"</b> to see the validator engine scan records, check rules, and auto-assign unique sequence IDs.
                    </p>
                  </Card>
                ) : isValidating ? (
                  <Card className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px] border-[#EFE4DC] dark:border-[#1C3547]">
                    <div className="p-4 rounded-2xl bg-nude-peachTint/50 dark:bg-night-cardElevated/50 text-lightAccent-peach dark:text-nightAccent-peach mb-3">
                      <RefreshCw className="w-7 h-7 animate-spin" />
                    </div>
                    <h3 className="font-heading font-black text-base text-textLight-heading dark:text-textNight-heading">
                      Running Django Validator...
                    </h3>
                    <p className="text-xs text-textLight-secondary dark:text-textNight-secondary max-w-md mt-1 leading-relaxed font-sans">
                      Analyzing columns, checking check constraints, and assigning sequential keys.
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {/* Summary Badges Panel */}
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="p-4 flex flex-col justify-between border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-cute uppercase font-bold text-textLight-secondary dark:text-textNight-secondary">Scanned Rows</span>
                        <span className="text-xl font-heading font-black text-textLight-heading dark:text-textNight-heading mt-1">{summary.total}</span>
                      </Card>
                      <Card className="p-4 flex flex-col justify-between bg-emerald-500/5 border-emerald-300 dark:border-emerald-800">
                        <span className="text-[10px] font-cute uppercase font-bold text-emerald-800 dark:text-emerald-300">Valid Rows (To Import)</span>
                        <span className="text-xl font-heading font-black text-emerald-600 dark:text-emerald-400 mt-1">{summary.valid}</span>
                      </Card>
                      <Card className="p-4 flex flex-col justify-between bg-red-500/5 border-red-300 dark:border-red-800">
                        <span className="text-[10px] font-cute uppercase font-bold text-red-800 dark:text-red-300">Invalid Rows (Ignored)</span>
                        <span className="text-xl font-heading font-black text-red-500 dark:text-red-400 mt-1">{summary.invalid}</span>
                      </Card>
                    </div>

                    {/* Preview Table */}
                    <Card className="p-0 overflow-hidden border-slate-200 dark:border-slate-800">
                      <div className="p-4 bg-nude-cardSec dark:bg-night-cardSoft border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <h4 className="font-heading font-black text-xs text-textLight-heading dark:text-textNight-heading uppercase tracking-wider">
                          Validator Queue & Auto ID Assign {fileName && `(${fileName})`}
                        </h4>
                        <span className="text-[10px] font-sans text-textLight-secondary dark:text-textNight-secondary">
                          Next ID starts from: <b>HOSP{nextIdSequence.toString().padStart(6, '0')}</b>
                        </span>
                      </div>

                      <div className="overflow-x-auto max-h-[300px] scrollbar-thin">
                        <table className="w-full text-left text-xs border-collapse font-sans">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-textLight-secondary dark:text-textNight-secondary">
                              <th className="p-3 text-center">#</th>
                              <th className="p-3">Generated ID</th>
                              <th className="p-3">Name</th>
                              <th className="p-3">Type</th>
                              <th className="p-3">Location</th>
                              <th className="p-3">API Endpoint</th>
                              <th className="p-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationResults.map((item, idx) => (
                              <tr
                                key={item.row.tempId}
                                className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                                  !item.isValid ? 'bg-red-500/[0.02]' : ''
                                }`}
                              >
                                <td className="p-3 text-center text-textLight-secondary dark:text-textNight-secondary font-bold font-cute">
                                  {idx + 1}
                                </td>
                                <td className="p-3 font-mono font-bold text-textLight-heading dark:text-textNight-heading">
                                  {item.isValid ? (
                                    <span className="text-lightAccent-peach dark:text-nightAccent-peach bg-lightAccent-peach/10 dark:bg-nightAccent-peach/10 px-2 py-0.5 rounded-md">
                                      {item.generatedId}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 dark:text-slate-600">—</span>
                                  )}
                                </td>
                                <td className="p-3 font-semibold text-textLight-heading dark:text-textNight-heading">
                                  {item.row.HospitalName || <span className="text-red-500 italic">Empty Name</span>}
                                </td>
                                <td className="p-3 text-textLight-secondary dark:text-textNight-secondary">
                                  {item.row.HospitalType || <span className="text-red-500 italic">Empty Type</span>}
                                </td>
                                <td className="p-3 text-textLight-secondary dark:text-textNight-secondary">
                                  {item.row.Location || <span className="text-red-500 italic">Empty Location</span>}
                                </td>
                                <td className="p-3 font-mono text-[11px] max-w-[150px] truncate text-textLight-secondary dark:text-textNight-secondary">
                                  {item.row.APIEndpoint || <span className="text-red-500 italic">Empty Endpoint</span>}
                                </td>
                                <td className="p-3 text-center">
                                  {item.isValid ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                                    </span>
                                  ) : (
                                    <span
                                      title={item.errors.join(' ')}
                                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/40 text-red-500 border border-red-200 dark:border-red-800 cursor-help"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Import Action Bar */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-textLight-secondary dark:text-textNight-secondary">
                          <Info className="w-4 h-4 text-lightAccent-peach dark:text-nightAccent-peach shrink-0" />
                          <span>Hover over "Invalid" badges to see error reasons. Only valid rows will get created.</span>
                        </div>
                        <button
                          disabled={summary.valid === 0}
                          onClick={handleConfirmImport}
                          className={`px-5 py-2.5 rounded-xl font-cute uppercase font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all ${
                            summary.valid > 0
                              ? 'bg-lightAccent-peach dark:bg-nightAccent-peach text-white hover:opacity-90 shadow-lightAccent-peach/20'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                          Confirm Import ({summary.valid} Rows)
                        </button>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'database' && (
          <motion.div
            key="database-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans"
          >
            {/* Description Card */}
            <div className="lg:col-span-1 space-y-4">
              <Card className="p-5 space-y-4 border-slate-200 dark:border-slate-800 h-full">
                <div>
                  <h3 className="font-heading font-black text-sm text-textLight-heading dark:text-textNight-heading flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-lightAccent-peach dark:text-nightAccent-peach" />
                    Database-Level Uniqueness
                  </h3>
                  <p className="text-xs text-textLight-secondary dark:text-textNight-secondary font-sans leading-relaxed mt-2">
                    To prevent duplication when multiple Excel sheets are loaded concurrently, the database enforces strict integrity constraints. Uniqueness is guaranteed at the database engine layer.
                  </p>
                </div>

                <div className="space-y-3.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-textLight-heading dark:text-textNight-heading">Unique Index Constraint</h4>
                      <p className="text-[10px] text-textLight-secondary dark:text-textNight-secondary leading-normal mt-0.5">
                        A unique B-Tree index on <code>hospital_id</code> ensures O(log n) lookups and throws duplicate key errors on concurrent overlap.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-textLight-heading dark:text-textNight-heading">ID Format Validation</h4>
                      <p className="text-[10px] text-textLight-secondary dark:text-textNight-secondary leading-normal mt-0.5">
                        A constraint check <code>CHECK (hospital_id LIKE 'HOSP______')</code> enforces compliance with the alphanumeric pattern.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-textLight-heading dark:text-textNight-heading">Immutability Rule</h4>
                      <p className="text-[10px] text-textLight-secondary dark:text-textNight-secondary leading-normal mt-0.5">
                        All identifiers are mapped to read-only fields. Update procedures omit the ID column entirely.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* SQL Snippets Panel */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-5 border-slate-200 dark:border-slate-800">
                <h3 className="font-heading font-black text-sm text-textLight-heading dark:text-textNight-heading mb-1">
                  Database Schema Definition (SQL)
                </h3>
                <p className="text-xs text-textLight-secondary dark:text-textNight-secondary mb-4">
                  The SQL script illustrating table constraints, indexes, check rules, and sequence definitions.
                </p>

                <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-850">
                  <span className="text-slate-500 font-bold block mb-1">-- Enforces Alphanumeric Pattern (HOSP000001, etc.)</span>
                  <span className="text-blue-400">CREATE TABLE</span> <span className="text-purple-400">hospitals</span> (<br />
                  &nbsp;&nbsp;hospital_id <span className="text-green-400">VARCHAR</span>(<span className="text-orange-400">10</span>) <span className="text-blue-400">PRIMARY KEY</span>,<br />
                  &nbsp;&nbsp;name <span className="text-green-400">VARCHAR</span>(<span className="text-orange-400">255</span>) <span className="text-blue-400">NOT NULL</span>,<br />
                  &nbsp;&nbsp;type <span className="text-green-400">VARCHAR</span>(<span className="text-orange-400">100</span>) <span className="text-blue-400">NOT NULL</span>,<br />
                  &nbsp;&nbsp;location <span className="text-green-400">VARCHAR</span>(<span className="text-orange-400">100</span>) <span className="text-blue-400">NOT NULL</span>,<br />
                  &nbsp;&nbsp;api_endpoint <span className="text-green-400">VARCHAR</span>(<span className="text-orange-400">512</span>) <span className="text-blue-400">NOT NULL</span>,<br />
                  &nbsp;&nbsp;created_at <span className="text-green-400">TIMESTAMP</span> <span className="text-blue-400">DEFAULT</span> CURRENT_TIMESTAMP,<br /><br />
                  &nbsp;&nbsp;<span className="text-slate-500 font-bold">-- Constraint: Guarantees length and alphanumeric sequence format</span><br />
                  &nbsp;&nbsp;<span className="text-blue-400">CONSTRAINT</span> chk_id_format <span className="text-blue-400">CHECK</span> (hospital_id ~ <span className="text-orange-400">'^HOSP\d&#123;6&#125;$'</span>)<br />
                  );<br /><br />
                  <span className="text-slate-500 font-bold block mb-1">-- Unique index ensures zero duplicates during race conditions</span>
                  <span className="text-blue-400">CREATE UNIQUE INDEX</span> idx_hospitals_uid <span className="text-blue-400">ON</span> <span className="text-purple-400">hospitals</span>(hospital_id);<br /><br />
                  <span className="text-slate-500 font-bold block mb-1">-- Trigger prevents mutating hospital_id during updates</span>
                  <span className="text-blue-400">CREATE OR REPLACE FUNCTION</span> <span className="text-yellow-400">prevent_id_change</span>() <span className="text-blue-400">RETURNS</span> TRIGGER <span className="text-blue-400">AS $$</span><br />
                  <span className="text-blue-400">BEGIN</span><br />
                  &nbsp;&nbsp;<span className="text-blue-400">IF</span> NEW.hospital_id &lt;&gt; OLD.hospital_id <span className="text-blue-400">THEN</span><br />
                  &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-blue-400">RAISE EXCEPTION</span> <span className="text-orange-400">'HospitalID is immutable and cannot be updated.'</span>;<br />
                  &nbsp;&nbsp;<span className="text-blue-400">END IF</span>;<br />
                  &nbsp;&nbsp;<span className="text-blue-400">RETURN</span> NEW;<br />
                  <span className="text-blue-400">END;</span><br />
                  <span className="text-blue-400">$$ LANGUAGE</span> plpgsql;<br /><br />
                  <span className="text-blue-400">CREATE TRIGGER</span> trg_immutable_id <span className="text-blue-400">BEFORE UPDATE ON</span> <span className="text-purple-400">hospitals</span><br />
                  &nbsp;&nbsp;<span className="text-blue-400">FOR EACH ROW EXECUTE FUNCTION</span> <span className="text-yellow-400">prevent_id_change</span>();
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {activeTab === 'simulation' && (
          <motion.div
            key="simulation-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans"
          >
            {/* Control Console */}
            <div className="lg:col-span-1 space-y-4">
              <Card className="p-5 border-slate-200 dark:border-slate-800 space-y-4">
                <div>
                  <h3 className="font-heading font-black text-sm text-textLight-heading dark:text-textNight-heading">
                    Simulator Controls
                  </h3>
                  <p className="text-xs text-textLight-secondary dark:text-textNight-secondary mt-1">
                    Control data traffic simulation for newly created hospitals. Auto-generated IDs will remain completely permanent and unaffected by simulation operations.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-nude-cardSec dark:bg-night-cardSoft border border-[#EFE4DC] dark:border-[#1C3547] flex flex-col items-center justify-center text-center py-6">
                  <div className={`p-4 rounded-full mb-3 ${isSimulationRunning ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                    <RefreshCw className={`w-8 h-8 ${isSimulationRunning ? 'animate-spin' : ''}`} />
                  </div>
                  <span className="text-xs font-bold text-textLight-heading dark:text-textNight-heading">
                    Status: {isSimulationRunning ? 'Simulation Running' : 'Simulation Stopped'}
                  </span>
                  <p className="text-[10px] text-textLight-secondary dark:text-textNight-secondary mt-1">
                    {isSimulationRunning ? 'Emulating HL7/FHIR packet transmissions' : 'Data streams are offline'}
                  </p>

                  <div className="grid grid-cols-2 gap-3 w-full mt-5">
                    <button
                      onClick={() => setIsSimulationRunning(true)}
                      disabled={isSimulationRunning}
                      className={`py-2 rounded-xl text-xs font-bold font-cute uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        isSimulationRunning
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 text-white hover:opacity-95'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Start
                    </button>
                    <button
                      onClick={() => setIsSimulationRunning(false)}
                      disabled={!isSimulationRunning}
                      className={`py-2 rounded-xl text-xs font-bold font-cute uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        !isSimulationRunning
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:opacity-95'
                      }`}
                    >
                      <Square className="w-3.5 h-3.5 fill-current" /> Stop
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-textLight-secondary dark:text-textNight-secondary leading-relaxed bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-3 rounded-xl flex gap-2">
                  <Info className="w-4 h-4 text-lightAccent-peach dark:text-nightAccent-peach shrink-0 mt-0.5" />
                  <span>
                    The simulation engine connects to endpoints directly referencing each hospital's <b>HospitalID</b>. Changing an ID would break historical telemetry analysis, which is why they are configured as fully immutable columns.
                  </span>
                </div>
              </Card>
            </div>

            {/* Simulators List */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-5 border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-heading font-black text-sm text-textLight-heading dark:text-textNight-heading">
                      Active Telemetry Connectors
                    </h3>
                    <p className="text-xs text-textLight-secondary dark:text-textNight-secondary mt-0.5">
                      Lists active hospital nodes linked to the live stream.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-textLight-heading dark:text-textNight-heading bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                    {hospitals.filter(h => h.id.startsWith('HOSP')).length} New Hospital Nodes
                  </span>
                </div>

                <div data-lenis-prevent className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {hospitals.filter(h => h.id.startsWith('HOSP')).length === 0 ? (
                    <div className="p-8 text-center text-xs text-textLight-secondary dark:text-textNight-secondary italic">
                      No new sequential hospitals registered yet. Go to "Excel Upload" to import them.
                    </div>
                  ) : (
                    hospitals
                      .filter(h => h.id.startsWith('HOSP'))
                      .map((hospital) => (
                        <div
                          key={hospital.id}
                          className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-nude-cardSec/40 dark:bg-night-cardSoft/30 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-lightAccent-peach/10 text-lightAccent-peach dark:text-nightAccent-peach text-xs font-mono font-black">
                              {hospital.id}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-textLight-heading dark:text-textNight-heading">
                                {hospital.name}
                              </h4>
                              <p className="text-[10px] text-textLight-secondary dark:text-textNight-secondary flex items-center gap-2 mt-0.5">
                                <span>City: {hospital.city}</span>
                                <span>•</span>
                                <span>IP: {hospital.ipAddress || '127.0.0.1'}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                              Immutable ID
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                              Active
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
