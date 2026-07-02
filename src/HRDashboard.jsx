import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Calculator,
  Clock,
  ClipboardCheck,
  Download,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPinned,
  PencilLine,
  RefreshCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  UserCheck,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTableModule from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

const CR_TIMEZONE = 'America/Costa_Rica';
const DATE_FORMATTER = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'full',
  timeZone: CR_TIMEZONE,
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: CR_TIMEZONE,
});
const autoTable = autoTableModule.default || autoTableModule;

const EMPTY_EMPLOYEE_FORM = {
  userId: '',
  email: '',
  password: '',
  nombre: '',
  apellidos: '',
  identification: '',
  phone: '',
  position: '',
  hireDate: '',
  isAdmin: false,
  isSupervisor: false,
  supervisorUserId: '',
  isActive: true,
};

const EMPTY_LOCATION_FORM = {
  id: '',
  name: '',
  requiresDescription: false,
  sortOrder: 0,
  isActive: true,
};

const EMPTY_MARK_CORRECTION_FORM = {
  markId: '',
  employeeName: '',
  tipo: 'entrada',
  date: '',
  time: '',
  ubicacion: '',
  descripcion: '',
  reason: '',
};

const EMPTY_PAYROLL_PERIOD_FORM = {
  periodName: '',
  startDate: getDefaultStartDate(),
  endDate: getDefaultEndDate(),
  notes: '',
};

const MARK_TYPE_OPTIONS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'salida_almuerzo', label: 'Salida almuerzo' },
  { value: 'entrada_almuerzo', label: 'Entrada almuerzo' },
  { value: 'salida', label: 'Salida final' },
  { value: 'salida_final', label: 'Salida final alternativa' },
];

const OTHER_LOCATION = {
  id: 'other-system',
  name: 'Otro',
  requires_description: true,
  sort_order: 9999,
  is_active: true,
  created_at: null,
  updated_at: null,
  is_system: true,
};

const DEFAULT_ATTENDANCE_SETTINGS = {
  company_name: 'Empresa principal',
  calculation_mode: 'weekly',
  period_type: 'weekly',
  start_time: '08:00',
  end_time: '17:00',
  lunch_minutes: 60,
  requires_lunch_out: false,
  requires_lunch_in: false,
  auto_deduct_lunch: true,
  late_tolerance_minutes: 0,
  overtime_minimum_minutes: 60,
  rounding_rule: 'none',
  daily_regular_hours: 8,
  weekly_regular_hours: 48,
  biweekly_regular_hours: 96,
  daily_overtime_before_double: 4,
  sunday_rule: 'configurable',
  holiday_rule: 'configurable',
  requires_overtime_approval: true,
  requires_second_approval: false,
};

export default function HRDashboard({ session }) {
  const [activeView, setActiveView] = useState('dashboard');
  const [employees, setEmployees] = useState([]);
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  const [records, setRecords] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEmployeeSaving, setIsEmployeeSaving] = useState(false);
  const [isEmployeeDirectoryRefreshing, setIsEmployeeDirectoryRefreshing] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeFeedback, setEmployeeFeedback] = useState('');
  const [employeeError, setEmployeeError] = useState('');
  const [teamSupervisor, setTeamSupervisor] = useState(null);
  const [teamEmployeeIds, setTeamEmployeeIds] = useState([]);
  const [isTeamSaving, setIsTeamSaving] = useState(false);
  const [configSection, setConfigSection] = useState('jornada');
  const [locations, setLocations] = useState([]);
  const [isLocationSaving, setIsLocationSaving] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState('');
  const [locationError, setLocationError] = useState('');
  const [markCorrectionForm, setMarkCorrectionForm] = useState(EMPTY_MARK_CORRECTION_FORM);
  const [isMarkCorrectionModalOpen, setIsMarkCorrectionModalOpen] = useState(false);
  const [isMarkCorrectionSaving, setIsMarkCorrectionSaving] = useState(false);
  const [validatingMarkId, setValidatingMarkId] = useState('');
  const [markCorrectionFeedback, setMarkCorrectionFeedback] = useState('');
  const [markCorrectionError, setMarkCorrectionError] = useState('');
  const [attendanceSettings, setAttendanceSettings] = useState(DEFAULT_ATTENDANCE_SETTINGS);
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [approvalRows, setApprovalRows] = useState([]);
  const [savedCalculationRows, setSavedCalculationRows] = useState([]);
  const [approvalFeedback, setApprovalFeedback] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [isApprovalSaving, setIsApprovalSaving] = useState(false);
  const [approvalDetailRow, setApprovalDetailRow] = useState(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [calculationFeedback, setCalculationFeedback] = useState('');
  const [calculationError, setCalculationError] = useState('');
  const [isCalculationSaving, setIsCalculationSaving] = useState(false);
  const [isBackendCalculating, setIsBackendCalculating] = useState(false);
  const [hoursSummaryRows, setHoursSummaryRows] = useState([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [payrollExportRows, setPayrollExportRows] = useState([]);
  const [isPayrollExportLoading, setIsPayrollExportLoading] = useState(false);
  const [payrollExportError, setPayrollExportError] = useState('');
  const [approvalAuditRows, setApprovalAuditRows] = useState([]);
  const [isApprovalAuditLoading, setIsApprovalAuditLoading] = useState(false);
  const [approvalAuditError, setApprovalAuditError] = useState('');
  const [markAuditRows, setMarkAuditRows] = useState([]);
  const [isMarkAuditLoading, setIsMarkAuditLoading] = useState(false);
  const [markAuditError, setMarkAuditError] = useState('');
  const [payrollPeriods, setPayrollPeriods] = useState([]);
  const [payrollPeriodForm, setPayrollPeriodForm] = useState(EMPTY_PAYROLL_PERIOD_FORM);
  const [isPayrollPeriodSaving, setIsPayrollPeriodSaving] = useState(false);
  const [payrollPeriodFeedback, setPayrollPeriodFeedback] = useState('');
  const [payrollPeriodError, setPayrollPeriodError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentUserName =
    session?.user?.user_metadata?.display_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email;

  const isAdmin = isAdminSession(session);
  const visibleEmployees = useMemo(
    () => getVisibleEmployees(employees, showInactiveEmployees),
    [employees, showInactiveEmployees]
  );
  const activeEmployees = useMemo(
    () => getVisibleEmployees(employees, false),
    [employees]
  );
  const singleEmployeeFilter = getSingleSelectedEmployeeFilter(selectedEmployees);

  useEffect(() => {
    const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.user_id));
    setSelectedEmployees((current) => current.filter((employeeId) => activeEmployeeIds.has(employeeId)));
  }, [activeEmployees]);

  useEffect(() => {
    if (isAdmin) {
      loadInitialData();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    setErrorMsg('');
    setLocationError('');

    try {
      const [employeesResult] = await Promise.all([
        supabase.rpc('get_employee_directory'),
      ]);

      if (employeesResult.error) throw employeesResult.error;

      setEmployees(employeesResult.data || []);
      setRecords([]);
      await Promise.all([
        refreshLocations({ silentFallback: false }),
        refreshAttendanceSettings({ silentFallback: false }),
        refreshPayrollPeriods({ silent: true }),
      ]);
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible cargar el panel de RRHH.');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDirectory = async () => {
    setIsEmployeeDirectoryRefreshing(true);
    setEmployeeError('');

    try {
      const { data, error } = await supabase.rpc('get_employee_directory');
      if (error) throw error;
      setEmployees(data || []);
      setEmployeeFeedback('Lista actualizada.');
    } catch (error) {
      setEmployeeError(error.message || 'No fue posible recargar la lista.');
      throw error;
    } finally {
      setIsEmployeeDirectoryRefreshing(false);
    }
  };

  const refreshLocations = async ({ silentFallback = true } = {}) => {
    setLocationError('');

    const adminResult = await supabase.rpc('admin_list_attendance_locations');
    if (!adminResult.error) {
      const normalizedAdminLocations = normalizeAttendanceLocations(adminResult.data || []);
      setLocations(normalizedAdminLocations);
      return normalizedAdminLocations;
    }

    const fallbackResult = await supabase.rpc('get_attendance_locations');
    if (!fallbackResult.error) {
      const normalizedLocations = normalizeAttendanceLocations((fallbackResult.data || []).map((location, index) => ({
        id: location.id ?? `fallback-${index}-${location.name}`,
        name: location.name,
        requires_description: Boolean(location.requires_description),
        sort_order: location.sort_order ?? index,
        is_active: location.is_active !== false,
        created_at: location.created_at || null,
        updated_at: location.updated_at || null,
      })));

      setLocations(normalizedLocations);
      if (!silentFallback) {
        setLocationError(
          'Se cargaron los lugares visibles del sistema, pero faltan permisos o funciones de administracion para editarlos por completo.'
        );
      }
      return normalizedLocations;
    }

    setLocations([]);
    throw adminResult.error;
  };

  const refreshAttendanceSettings = async ({ silentFallback = true } = {}) => {
    setSettingsError('');

    const { data, error } = await supabase.rpc('admin_get_attendance_settings');

    if (error) {
      setAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS);
      if (!silentFallback) {
        setSettingsError(
          `No fue posible leer reglas desde Supabase: ${error.message}. Se usaran reglas base temporales en el frontend.`
        );
      }
      return DEFAULT_ATTENDANCE_SETTINGS;
    }

    const row = data?.[0];
    const nextSettings = row ? normalizeAttendanceSettings(row) : DEFAULT_ATTENDANCE_SETTINGS;
    setAttendanceSettings(nextSettings);
    return nextSettings;
  };

  const handleAttendanceSettingsSave = async (event) => {
    event.preventDefault();
    setIsSettingsSaving(true);
    setSettingsFeedback('');
    setSettingsError('');

    try {
      const { error } = await supabase.rpc('admin_upsert_attendance_settings', {
        company_name: attendanceSettings.company_name,
        calculation_mode: attendanceSettings.calculation_mode,
        period_type: attendanceSettings.period_type,
        start_time_text: attendanceSettings.start_time,
        end_time_text: attendanceSettings.end_time,
        lunch_minutes: Number(attendanceSettings.lunch_minutes) || 0,
        requires_lunch_out: attendanceSettings.requires_lunch_out,
        requires_lunch_in: attendanceSettings.requires_lunch_in,
        auto_deduct_lunch: attendanceSettings.auto_deduct_lunch,
        late_tolerance_minutes: Number(attendanceSettings.late_tolerance_minutes) || 0,
        overtime_minimum_minutes: Number(attendanceSettings.overtime_minimum_minutes) || 0,
        rounding_rule: attendanceSettings.rounding_rule,
        daily_regular_hours: Number(attendanceSettings.daily_regular_hours) || 0,
        weekly_regular_hours: Number(attendanceSettings.weekly_regular_hours) || 0,
        biweekly_regular_hours: Number(attendanceSettings.biweekly_regular_hours) || 0,
        daily_overtime_before_double: Number(attendanceSettings.daily_overtime_before_double) || 0,
        sunday_rule: attendanceSettings.sunday_rule,
        holiday_rule: attendanceSettings.holiday_rule,
        requires_overtime_approval: attendanceSettings.requires_overtime_approval,
        requires_second_approval: attendanceSettings.requires_second_approval,
      });

      if (error) throw error;

      await refreshAttendanceSettings();
      setSettingsFeedback('Configuracion guardada correctamente.');
    } catch (error) {
      setSettingsError(error.message || 'No fue posible guardar la configuracion.');
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const refreshPayrollPeriods = async ({ silent = false } = {}) => {
    if (!silent) {
      setIsPayrollPeriodSaving(true);
    }
    setPayrollPeriodError('');

    try {
      const { data, error } = await supabase.rpc('admin_list_payroll_periods');

      if (error) throw error;

      setPayrollPeriods(data || []);
      return data || [];
    } catch (error) {
      const message = error.message || 'No fue posible cargar los periodos de planilla.';
      if (!silent) {
        setPayrollPeriodError(
          message.includes('admin_list_payroll_periods')
            ? `${message}. Ejecuta supabase/hr_platform_patch_013_payroll_period_closure.sql y vuelve a intentar.`
            : message
        );
      }
      return [];
    } finally {
      if (!silent) {
        setIsPayrollPeriodSaving(false);
      }
    }
  };

  const handlePayrollPeriodClose = async (event) => {
    event.preventDefault();
    setIsPayrollPeriodSaving(true);
    setPayrollPeriodFeedback('');
    setPayrollPeriodError('');

    try {
      const { error } = await supabase.rpc('admin_close_payroll_period', {
        period_name: payrollPeriodForm.periodName.trim(),
        period_start_date: payrollPeriodForm.startDate || null,
        period_end_date: payrollPeriodForm.endDate || null,
        period_notes: payrollPeriodForm.notes.trim() || null,
      });

      if (error) throw error;

      setPayrollPeriodFeedback('Periodo cerrado correctamente.');
      setPayrollPeriodForm(EMPTY_PAYROLL_PERIOD_FORM);
      await refreshPayrollPeriods({ silent: true });
    } catch (error) {
      const message = error.message || 'No fue posible cerrar el periodo.';
      setPayrollPeriodError(
        message.includes('admin_close_payroll_period')
          ? `${message}. Ejecuta supabase/hr_platform_patch_013_payroll_period_closure.sql y vuelve a intentar.`
          : message
      );
    } finally {
      setIsPayrollPeriodSaving(false);
    }
  };

  const handlePayrollPeriodReopen = async (period) => {
    const confirmed = window.confirm(
      `Se reabrira el periodo "${period.period_name}". Las fechas quedaran habilitadas para nuevos cambios.`
    );

    if (!confirmed) return;

    setIsPayrollPeriodSaving(true);
    setPayrollPeriodFeedback('');
    setPayrollPeriodError('');

    try {
      const { error } = await supabase.rpc('admin_reopen_payroll_period', {
        period_id: period.id,
      });

      if (error) throw error;

      setPayrollPeriodFeedback('Periodo reabierto correctamente.');
      await refreshPayrollPeriods({ silent: true });
    } catch (error) {
      setPayrollPeriodError(error.message || 'No fue posible reabrir el periodo.');
    } finally {
      setIsPayrollPeriodSaving(false);
    }
  };

  const refreshOvertimeApprovals = async () => {
    const { data, error } = await supabase.rpc('admin_list_overtime_approvals', {
      filter_user_id: singleEmployeeFilter,
      filter_start_date: startDate || null,
      filter_end_date: endDate || null,
    });

    if (error) {
      setApprovalRows([]);
      return [];
    }

    const rows = filterRowsBySelectedEmployees(data || [], selectedEmployees);
    setApprovalRows(rows);
    return rows;
  };

  const refreshSavedCalculations = async () => {
    const { data, error } = await supabase.rpc('admin_list_hour_calculations', {
      filter_user_id: singleEmployeeFilter,
      filter_start_date: startDate || null,
      filter_end_date: endDate || null,
    });

    if (error) {
      setSavedCalculationRows([]);
      return [];
    }

    const rows = filterRowsBySelectedEmployees(data || [], selectedEmployees, 'employee_user_id');
    setSavedCalculationRows(rows);
    return rows;
  };

  const openApprovalDetail = (row) => {
    setApprovalDetailRow(row);
    setApprovalComment(row.approvalNotes || '');
    setApprovalError('');
    setApprovalFeedback('');
  };

  const closeApprovalDetail = () => {
    if (isApprovalSaving) return;
    setApprovalDetailRow(null);
    setApprovalComment('');
  };

  const handleApprovalStatusChange = async (row, status, customNotes = '') => {
    setIsApprovalSaving(true);
    setApprovalFeedback('');
    setApprovalError('');

    try {
      const defaultNotes = status === 'approved'
        ? 'Aprobado desde el panel de RRHH.'
        : status === 'rejected'
          ? 'Rechazado desde el panel de RRHH.'
          : 'Requiere correccion desde el panel de RRHH.';
      const notes = customNotes.trim() || defaultNotes;

      const { error } = await supabase.rpc('admin_set_overtime_approval', {
        employee_user_id: row.userId,
        work_date: row.dateKey,
        suggested_overtime_hours: row.overtimeHours,
        suggested_double_hours: row.doubleHours,
        approval_status: status,
        approval_notes: notes,
      });

      if (error) throw error;

      await Promise.all([
        refreshOvertimeApprovals(),
        refreshSavedCalculations(),
        refreshApprovalAudit({ silent: true }),
      ]);
      setApprovalDetailRow(null);
      setApprovalComment('');
      setApprovalFeedback('Estado de aprobacion actualizado.');
    } catch (error) {
      setApprovalError(
        error.message ||
        'No fue posible actualizar la aprobacion. Verifica que hr_platform_foundation.sql este instalado.'
      );
    } finally {
      setIsApprovalSaving(false);
    }
  };

  const handleSaveHourCalculations = async () => {
    setIsCalculationSaving(true);
    setCalculationFeedback('');
    setCalculationError('');

    try {
      const payload = calculatedRows.map((row) => ({
        employee_user_id: row.userId,
        work_date: row.dateKey,
        entry_time: row.entryTime || '',
        lunch_out_time: row.lunchOutTime || '',
        lunch_in_time: row.lunchInTime || '',
        exit_time: row.exitTime || '',
        worked_hours: Number(row.workedHours.toFixed(2)),
        regular_hours: Number(row.regularHours.toFixed(2)),
        overtime_hours: Number(row.overtimeHours.toFixed(2)),
        double_hours: Number(row.doubleHours.toFixed(2)),
        calculation_status: row.status === 'Completo' ? 'complete' : 'requires_review',
        observations: row.notes,
        raw_mark_ids: row.rawMarkIds,
      }));

      const { data, error } = await supabase.rpc('admin_save_hour_calculations', {
        calculations: payload,
      });

      if (error) throw error;

      await Promise.all([
        refreshOvertimeApprovals(),
        refreshSavedCalculations(),
      ]);
      setCalculationFeedback(`${data || payload.length} calculos guardados correctamente.`);
    } catch (error) {
      setCalculationError(
        error.message ||
        'No fue posible guardar los calculos. Ejecuta la version actualizada de hr_platform_foundation.sql.'
      );
    } finally {
      setIsCalculationSaving(false);
    }
  };

  const handleBackendHourCalculation = async ({ persistResults = false } = {}) => {
    setIsBackendCalculating(true);
    setCalculationFeedback('');
    setCalculationError('');

    try {
      const { data, error } = await supabase.rpc('admin_calculate_hours_from_marks', {
        filter_user_id: singleEmployeeFilter,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
        persist_results: persistResults,
      });

      if (error) throw error;

      setRecords(filterRowsBySelectedEmployees(normalizeBackendCalculationRows(data || []), selectedEmployees, 'user_id'));
      await Promise.all([
        refreshOvertimeApprovals(),
        refreshSavedCalculations(),
      ]);
      setCalculationFeedback(
        persistResults
          ? `${data?.length || 0} calculos generados y guardados desde Supabase.`
          : `${data?.length || 0} calculos generados desde Supabase.`
      );
    } catch (error) {
      setCalculationError(
        error.message ||
        'No fue posible calcular desde Supabase. Ejecuta hr_platform_patch_008_backend_hour_calculation.sql.'
      );
    } finally {
      setIsBackendCalculating(false);
    }
  };

  const refreshReport = async () => {
    setIsRefreshing(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.rpc('get_attendance_report', {
        filter_user_id: singleEmployeeFilter,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      });

      if (error) throw error;

      setRecords(normalizeRecords(data || []));
      await Promise.all([
        refreshOvertimeApprovals(),
        refreshSavedCalculations(),
      ]);
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible actualizar el reporte.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return records.filter((record) => {
      const matchesEmployee = matchesSelectedEmployee(record.user_id, selectedEmployees);
      const matchesSearch =
        !query ||
        record.employee_name.toLowerCase().includes(query) ||
        record.employee_email.toLowerCase().includes(query) ||
        record.ubicacion.toLowerCase().includes(query) ||
        (record.descripcion || '').toLowerCase().includes(query);

      return matchesEmployee && matchesSearch;
    });
  }, [records, searchText, selectedEmployees]);

  const groupedRecords = useMemo(() => groupRecords(filteredRecords), [filteredRecords]);
  const approvalMap = useMemo(() => {
    const map = new Map();
    approvalRows.forEach((row) => {
      map.set(`${row.employee_user_id}-${row.work_date}`, row);
    });
    return map;
  }, [approvalRows]);
  const savedCalculationMap = useMemo(() => {
    const map = new Map();
    savedCalculationRows.forEach((row) => {
      map.set(`${row.employee_user_id}-${row.work_date}`, row);
    });
    return map;
  }, [savedCalculationRows]);
  const calculatedRows = useMemo(
    () => calculateHourRows(filteredRecords, attendanceSettings, approvalMap, savedCalculationMap),
    [approvalMap, attendanceSettings, filteredRecords, savedCalculationMap]
  );
  const exportRows = useMemo(() => buildExportRows(filteredRecords), [filteredRecords]);

  const stats = useMemo(() => {
    const uniqueEmployees = new Set(filteredRecords.map((record) => record.user_id));
    const pendingReview = calculatedRows.filter((row) => row.status !== 'Completo').length;
    const pendingOvertime = calculatedRows.filter((row) => row.overtimeHours > 0).length;
    return {
      totalRecords: filteredRecords.length,
      totalEmployees: uniqueEmployees.size,
      totalEntries: filteredRecords.filter((record) => record.tipo === 'entrada').length,
      totalExits: filteredRecords.filter((record) => record.tipo === 'salida').length,
      pendingReview,
      pendingOvertime,
    };
  }, [calculatedRows, filteredRecords]);

  const handleExportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Asistencias');
    XLSX.writeFile(workbook, buildFilename('xlsx'));
  };

  const handleExportHoursSummary = () => {
    const sheet = XLSX.utils.json_to_sheet(hoursSummaryRows.map((row) => ({
      Colaborador: row.employee_name,
      Correo: row.employee_email,
      Dias: row.days_calculated,
      'Horas trabajadas': Number(row.total_worked_hours || 0),
      'Horas ordinarias': Number(row.total_regular_hours || 0),
      'Horas extra': Number(row.total_overtime_hours || 0),
      'Horas dobles': Number(row.total_double_hours || 0),
      Pendientes: row.pending_approvals,
      Aprobadas: row.approved_approvals,
      Rechazadas: row.rejected_approvals,
      'Dias con revision': row.requires_review_days,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Resumen horas');
    XLSX.writeFile(workbook, buildFilename('resumen-horas.xlsx'));
  };

  const handleExportPayrollReport = () => {
    const sheet = XLSX.utils.json_to_sheet(payrollExportRows.map((row) => ({
      Colaborador: row.employee_name,
      Correo: row.employee_email,
      Identificacion: row.identification || '',
      Puesto: row.job_position || '',
      'Periodo inicio': row.period_start,
      'Periodo fin': row.period_end,
      Dias: row.days_calculated,
      'Horas trabajadas': Number(row.total_worked_hours || 0),
      'Ordinarias a pagar': Number(row.regular_hours_to_pay || 0),
      'Extras aprobadas a pagar': Number(row.approved_overtime_hours_to_pay || 0),
      'Dobles aprobadas a pagar': Number(row.approved_double_hours_to_pay || 0),
      'Extras pendientes': Number(row.pending_overtime_hours || 0),
      'Dobles pendientes': Number(row.pending_double_hours || 0),
      'Extras rechazadas': Number(row.rejected_overtime_hours || 0),
      'Dobles rechazadas': Number(row.rejected_double_hours || 0),
      'Dias con revision': row.requires_review_days,
      'Periodos cerrados': row.closed_periods,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Planilla');
    XLSX.writeFile(workbook, buildFilename('planilla.xlsx'));
  };

  const handleExportApprovalAudit = () => {
    const sheet = XLSX.utils.json_to_sheet(approvalAuditRows.map((row) => ({
      Colaborador: row.employee_name,
      Correo: row.employee_email,
      Fecha: row.work_date,
      'Estado anterior': getApprovalStatusLabel(row.previous_status),
      'Estado nuevo': getApprovalStatusLabel(row.new_status),
      'Horas extra': Number(row.suggested_overtime_hours || 0),
      'Horas dobles': Number(row.suggested_double_hours || 0),
      Nota: row.notes || '',
      'Cambiado por': row.changed_by_name || '',
      'Fecha cambio': formatShortDateTime(row.changed_at),
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Auditoria extras');
    XLSX.writeFile(workbook, buildFilename('auditoria-extras.xlsx'));
  };

  const handleExportMarkAudit = () => {
    const sheet = XLSX.utils.json_to_sheet(markAuditRows.map((row) => ({
      Colaborador: row.employee_name,
      Correo: row.employee_email,
      Accion: row.action,
      Motivo: row.reason || '',
      'Tipo original': row.original_tipo,
      'Tipo corregido': row.corrected_tipo,
      'Ubicacion original': row.original_ubicacion,
      'Ubicacion corregida': row.corrected_ubicacion,
      'Fecha original': formatShortDateTime(row.original_created_at),
      'Fecha corregida': formatShortDateTime(row.corrected_created_at),
      'Cambiado por': row.changed_by_name || '',
      'Fecha cambio': formatShortDateTime(row.changed_at),
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Correcciones marcas');
    XLSX.writeFile(workbook, buildFilename('correcciones-marcas.xlsx'));
  };

  const refreshHoursSummaryReport = async () => {
    setIsSummaryLoading(true);
    setSummaryError('');

    try {
      const { data, error } = await supabase.rpc('admin_get_hours_summary_report', {
        filter_user_id: singleEmployeeFilter,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      });

      if (error) throw error;

      setHoursSummaryRows(filterRowsBySelectedEmployees(data || [], selectedEmployees));
    } catch (error) {
      const message = error.message || 'No fue posible cargar el resumen persistido de horas.';
      setSummaryError(
        message.includes('admin_get_hours_summary_report')
          ? `${message}. Ejecuta supabase/hr_platform_patch_007_reports_schema_reload.sql y vuelve a intentar.`
          : message
      );
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const refreshApprovalAudit = async ({ silent = false } = {}) => {
    if (!silent) {
      setIsApprovalAuditLoading(true);
    }
    setApprovalAuditError('');

    try {
      const { data, error } = await supabase.rpc('admin_list_overtime_approval_audit', {
        filter_user_id: singleEmployeeFilter,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      });

      if (error) throw error;

      const rows = filterRowsBySelectedEmployees(data || [], selectedEmployees);
      setApprovalAuditRows(rows);
      return rows;
    } catch (error) {
      const message = error.message || 'No fue posible cargar la bitacora de aprobaciones.';
      if (!silent) {
        setApprovalAuditError(
          message.includes('admin_list_overtime_approval_audit')
            ? `${message}. Ejecuta supabase/hr_platform_patch_009_approval_audit.sql y vuelve a intentar.`
            : message
        );
      }
      return [];
    } finally {
      if (!silent) {
        setIsApprovalAuditLoading(false);
      }
    }
  };

  const refreshPayrollExportReport = async () => {
    setIsPayrollExportLoading(true);
    setPayrollExportError('');

    try {
      const { data, error } = await supabase.rpc('admin_get_payroll_export_report', {
        filter_user_id: singleEmployeeFilter,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      });

      if (error) throw error;

      setPayrollExportRows(filterRowsBySelectedEmployees(data || [], selectedEmployees));
    } catch (error) {
      const message = error.message || 'No fue posible cargar el reporte de planilla.';
      setPayrollExportError(
        message.includes('admin_get_payroll_export_report')
          ? `${message}. Ejecuta supabase/hr_platform_patch_014_payroll_export_report.sql y vuelve a intentar.`
          : message
      );
    } finally {
      setIsPayrollExportLoading(false);
    }
  };

  const refreshMarkAudit = async ({ silent = false } = {}) => {
    if (!silent) {
      setIsMarkAuditLoading(true);
    }
    setMarkAuditError('');

    try {
      const { data, error } = await supabase.rpc('admin_list_attendance_mark_audit', {
        filter_user_id: singleEmployeeFilter,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      });

      if (error) throw error;

      const rows = filterRowsBySelectedEmployees(data || [], selectedEmployees);
      setMarkAuditRows(rows);
      return rows;
    } catch (error) {
      const message = error.message || 'No fue posible cargar la bitacora de correcciones.';
      if (!silent) {
        setMarkAuditError(
          message.includes('admin_list_attendance_mark_audit')
            ? `${message}. Ejecuta supabase/hr_platform_patch_010_attendance_corrections.sql y vuelve a intentar.`
            : message
        );
      }
      return [];
    } finally {
      if (!silent) {
        setIsMarkAuditLoading(false);
      }
    }
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Reporte de asistencias RRHH', 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Generado: ${DATE_TIME_FORMATTER.format(new Date())} | Registros: ${filteredRecords.length}`,
      14,
      23
    );

    autoTable(doc, {
      startY: 28,
      head: [[
        'Empleado',
        'Correo',
        'Fecha',
        'Hora',
        'Tipo',
        'Ubicacion',
        'Descripcion',
        'Latitud',
        'Longitud',
        'IP',
      ]],
      body: exportRows.map((row) => [
        row.Empleado,
        row.Correo,
        row.Fecha,
        row.Hora,
        row.Tipo,
        row.Ubicacion,
        row.Descripcion,
        row.Latitud,
        row.Longitud,
        row.IP,
      ]),
      styles: {
        fontSize: 8,
      },
      headStyles: {
        fillColor: [17, 32, 54],
      },
    });

    doc.save(buildFilename('pdf'));
  };

  const openCreateEmployeeModal = () => {
    setEmployeeForm(EMPTY_EMPLOYEE_FORM);
    setEmployeeFeedback('');
    setEmployeeError('');
    setIsEmployeeModalOpen(true);
  };

  const openEditEmployeeModal = (employee) => {
    setEmployeeForm({
      userId: employee.user_id,
      email: employee.email || '',
      password: '',
      nombre: employee.nombre || extractFirstName(employee.display_name),
      apellidos: employee.apellidos || extractLastName(employee.display_name),
      identification: employee.identification || '',
      phone: employee.phone || '',
      position: employee.position || employee.job_position || '',
      hireDate: employee.hire_date || '',
      isAdmin: Boolean(employee.is_admin),
      isSupervisor: Boolean(employee.is_supervisor),
      supervisorUserId: employee.supervisor_user_id || '',
      isActive: employee.is_active !== false,
    });
    setEmployeeFeedback('');
    setEmployeeError('');
    setIsEmployeeModalOpen(true);
  };

  const closeEmployeeModal = () => {
    if (isEmployeeSaving) return;
    setIsEmployeeModalOpen(false);
    setEmployeeForm(EMPTY_EMPLOYEE_FORM);
    setEmployeeFeedback('');
    setEmployeeError('');
  };

  const handleEmployeeSave = async (e) => {
    e.preventDefault();
    setIsEmployeeSaving(true);
    setEmployeeFeedback('');
    setEmployeeError('');

    try {
      const action = employeeForm.userId ? 'update' : 'create';
      const payload = {
        action,
        userId: employeeForm.userId || undefined,
        email: employeeForm.email.trim(),
        password: employeeForm.password || undefined,
        nombre: employeeForm.nombre.trim(),
        apellidos: employeeForm.apellidos.trim(),
        identification: employeeForm.identification.trim(),
        phone: employeeForm.phone.trim(),
        position: employeeForm.position.trim(),
        hireDate: employeeForm.hireDate || null,
        isAdmin: employeeForm.isAdmin,
        isSupervisor: employeeForm.isSupervisor,
        isActive: employeeForm.isActive,
      };

      const manageResult = await callManageEmployees(payload);
      const savedUserId = employeeForm.userId || manageResult?.user?.id;
      if (savedUserId) {
        const { error: supervisorError } = await supabase.rpc('admin_set_employee_supervisor', {
          target_employee_user_id: savedUserId,
          target_supervisor_user_id: employeeForm.supervisorUserId || null,
        });
        if (supervisorError) throw supervisorError;
      }
      await refreshDirectory();
      setEmployeeFeedback(
        employeeForm.userId
          ? 'Empleado actualizado correctamente.'
          : 'Empleado creado correctamente.'
      );
      if (!employeeForm.userId) {
        setEmployeeForm(EMPTY_EMPLOYEE_FORM);
      } else {
        setIsEmployeeModalOpen(false);
      }
    } catch (error) {
      setEmployeeError(error.message || 'No fue posible guardar el empleado.');
    } finally {
      setIsEmployeeSaving(false);
    }
  };

  const handleEmployeeDelete = async (employee) => {
    const confirmed = window.confirm(
      `Se inactivara la cuenta de ${employee.display_name}. El historial se conserva y puedes reactivarla despues.`
    );

    if (!confirmed) {
      return;
    }

    setEmployeeError('');
    setEmployeeFeedback('');
    setIsEmployeeSaving(true);

    try {
      await callManageEmployees({
        action: 'delete',
        userId: employee.user_id,
      });
      await refreshDirectory();
      setEmployeeFeedback('Empleado inactivado correctamente.');
    } catch (error) {
      setEmployeeError(error.message || 'No fue posible inactivar el empleado.');
    } finally {
      setIsEmployeeSaving(false);
    }
  };

  const handleEmployeeReactivate = async (employee) => {
    const confirmed = window.confirm(
      `Se reactivara la cuenta de ${employee.display_name} y podra volver a ingresar al sistema.`
    );

    if (!confirmed) {
      return;
    }

    setEmployeeError('');
    setEmployeeFeedback('');
    setIsEmployeeSaving(true);

    try {
      await callManageEmployees({
        action: 'update',
        userId: employee.user_id,
        email: employee.email || '',
        nombre: employee.nombre || extractFirstName(employee.display_name),
        apellidos: employee.apellidos || extractLastName(employee.display_name),
        identification: employee.identification || '',
        phone: employee.phone || '',
        position: employee.position || employee.job_position || '',
        hireDate: employee.hire_date || null,
        isAdmin: Boolean(employee.is_admin),
        isSupervisor: Boolean(employee.is_supervisor),
        isActive: true,
      });
      await refreshDirectory();
      setEmployeeFeedback('Empleado reactivado correctamente.');
    } catch (error) {
      setEmployeeError(error.message || 'No fue posible reactivar el empleado.');
    } finally {
      setIsEmployeeSaving(false);
    }
  };

  const openSupervisorTeamModal = (supervisor) => {
    setTeamSupervisor(supervisor);
    setTeamEmployeeIds(
      employees
        .filter((employee) => employee.is_active !== false && employee.supervisor_user_id === supervisor.user_id)
        .map((employee) => employee.user_id)
    );
    setEmployeeError('');
    setEmployeeFeedback('');
  };

  const closeSupervisorTeamModal = () => {
    if (isTeamSaving) return;
    setTeamSupervisor(null);
    setTeamEmployeeIds([]);
  };

  const handleSupervisorTeamSave = async () => {
    if (!teamSupervisor) return;
    setIsTeamSaving(true);
    setEmployeeError('');
    setEmployeeFeedback('');

    try {
      const assignableEmployees = employees.filter(
        (employee) => employee.is_active !== false && employee.user_id !== teamSupervisor.user_id
      );

      await Promise.all(
        assignableEmployees.map((employee) => {
          const shouldBeAssigned = teamEmployeeIds.includes(employee.user_id);
          const isCurrentlyAssigned = employee.supervisor_user_id === teamSupervisor.user_id;

          if (!shouldBeAssigned && !isCurrentlyAssigned) return Promise.resolve();

          return supabase.rpc('admin_set_employee_supervisor', {
            target_employee_user_id: employee.user_id,
            target_supervisor_user_id: shouldBeAssigned ? teamSupervisor.user_id : null,
          }).then(({ error }) => {
            if (error) throw error;
          });
        })
      );

      await refreshDirectory();
      setEmployeeFeedback(`Personal a cargo de ${teamSupervisor.display_name} actualizado.`);
      setTeamSupervisor(null);
      setTeamEmployeeIds([]);
    } catch (error) {
      setEmployeeError(error.message || 'No fue posible actualizar el personal a cargo.');
    } finally {
      setIsTeamSaving(false);
    }
  };

  const openCreateLocationModal = () => {
    setLocationForm(EMPTY_LOCATION_FORM);
    setLocationFeedback('');
    setLocationError('');
    setIsLocationModalOpen(true);
  };

  const openEditLocationModal = (location) => {
    setLocationForm({
      id: location.id,
      name: location.name || '',
      requiresDescription: Boolean(location.requires_description),
      sortOrder: location.sort_order ?? 0,
      isActive: location.is_active !== false,
    });
    setLocationFeedback('');
    setLocationError('');
    setIsLocationModalOpen(true);
  };

  const closeLocationModal = () => {
    if (isLocationSaving) return;
    setIsLocationModalOpen(false);
    setLocationForm(EMPTY_LOCATION_FORM);
    setLocationFeedback('');
    setLocationError('');
  };

  const handleLocationSave = async (e) => {
    e.preventDefault();
    setIsLocationSaving(true);
    setLocationFeedback('');
    setLocationError('');

    try {
      const { error } = await supabase.rpc('admin_upsert_attendance_location', {
        location_id: locationForm.id || null,
        location_name: locationForm.name.trim(),
        location_requires_description: locationForm.requiresDescription,
        location_sort_order: Number(locationForm.sortOrder) || 0,
        location_is_active: locationForm.isActive,
      });

      if (error) throw error;

      await refreshLocations();
      setLocationFeedback(
        locationForm.id ? 'Lugar actualizado correctamente.' : 'Lugar creado correctamente.'
      );
      setIsLocationModalOpen(false);
      setLocationForm(EMPTY_LOCATION_FORM);
    } catch (error) {
      setLocationError(error.message || 'No fue posible guardar el lugar.');
    } finally {
      setIsLocationSaving(false);
    }
  };

  const handleLocationDelete = async (location) => {
    const confirmed = window.confirm(
      `Se eliminara el lugar "${location.name}". Esta accion no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    setIsLocationSaving(true);
    setLocationFeedback('');
    setLocationError('');

    try {
      const { error } = await supabase.rpc('admin_delete_attendance_location', {
        location_id: location.id,
      });

      if (error) throw error;

      await refreshLocations();
      setLocationFeedback('Lugar eliminado correctamente.');
    } catch (error) {
      setLocationError(error.message || 'No fue posible eliminar el lugar.');
    } finally {
      setIsLocationSaving(false);
    }
  };

  const openMarkCorrectionModal = (record) => {
    setMarkCorrectionForm({
      markId: record.id,
      employeeName: record.employee_name,
      tipo: normalizeEditableMarkType(record.tipo),
      date: record.dateKey || formatDateKey(record.createdAt),
      time: (record.timeLabel || '').slice(0, 5),
      ubicacion: record.ubicacion || '',
      descripcion: record.descripcion || '',
      reason: '',
    });
    setMarkCorrectionFeedback('');
    setMarkCorrectionError('');
    setIsMarkCorrectionModalOpen(true);
  };

  const closeMarkCorrectionModal = () => {
    if (isMarkCorrectionSaving) return;
    setIsMarkCorrectionModalOpen(false);
    setMarkCorrectionForm(EMPTY_MARK_CORRECTION_FORM);
    setMarkCorrectionError('');
  };

  const handleMarkCorrectionSave = async (event) => {
    event.preventDefault();
    setIsMarkCorrectionSaving(true);
    setMarkCorrectionFeedback('');
    setMarkCorrectionError('');

    try {
      const correctedCreatedAt = buildCostaRicaTimestamp(markCorrectionForm.date, markCorrectionForm.time);

      const { error } = await supabase.rpc('admin_correct_attendance_mark', {
        attendance_mark_id: markCorrectionForm.markId,
        corrected_tipo: markCorrectionForm.tipo,
        corrected_ubicacion: markCorrectionForm.ubicacion.trim(),
        corrected_descripcion: markCorrectionForm.descripcion.trim(),
        corrected_created_at: correctedCreatedAt,
        correction_reason: markCorrectionForm.reason.trim(),
      });

      if (error) throw error;

      setMarkCorrectionFeedback('Marca corregida y auditada correctamente.');
      setIsMarkCorrectionModalOpen(false);
      setMarkCorrectionForm(EMPTY_MARK_CORRECTION_FORM);
      await Promise.all([
        refreshReport(),
        refreshMarkAudit({ silent: true }),
      ]);
    } catch (error) {
      const message = error.message || 'No fue posible corregir la marca.';
      setMarkCorrectionError(
        message.includes('admin_correct_attendance_mark')
          ? `${message}. Ejecuta supabase/hr_platform_patch_010_attendance_corrections.sql y vuelve a intentar.`
          : message
      );
    } finally {
      setIsMarkCorrectionSaving(false);
    }
  };

  const handleHrMarkValidation = async (record, status) => {
    const labels = {
      confirmed: 'confirmar',
      rejected: 'rechazar',
      duplicated: 'marcar como duplicada',
    };
    const actionLabel = labels[status] || 'validar';
    const confirmed = window.confirm(`Se va a ${actionLabel} la marca de ${record.employee_name}.`);

    if (!confirmed) {
      return;
    }

    let comment = '';
    if (status === 'rejected' || status === 'duplicated') {
      comment = window.prompt('Observacion breve para la trazabilidad:', '') || '';
    }

    setValidatingMarkId(record.id);
    setMarkCorrectionError('');
    setMarkCorrectionFeedback('');

    try {
      const { error } = await supabase.rpc('admin_validate_attendance_mark', {
        p_attendance_id: record.id,
        p_validation_status: status,
        p_validation_comment: comment.trim() || null,
      });

      if (error) throw error;

      setMarkCorrectionFeedback('Validacion administrativa guardada correctamente.');
      await refreshReport();
    } catch (error) {
      setMarkCorrectionError(error.message || 'No fue posible validar la marca desde RRHH.');
    } finally {
      setValidatingMarkId('');
    }
  };

  const callManageEmployees = async (payload) => {
    const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !currentSession?.access_token) {
      throw new Error('La sesion no es valida. Inicia sesion nuevamente.');
    }

    const { data, error } = await supabase.functions.invoke('manage-employees', {
      body: payload,
    });

    if (error) {
      throw new Error(data?.error || error.message || 'No fue posible completar la accion.');
    }

    return data;
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorMsg(error.message || 'No fue posible cerrar sesion.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="screen-center">
        <div className="reset-card">
          <div className="reset-icon">
            <ShieldAlert />
          </div>
          <h1>Acceso restringido</h1>
          <p>Solo los administradores autorizados pueden entrar a RRHH.</p>
          <button className="secondary-button" onClick={handleLogout}>
            <LogOut />
            <span>Cerrar sesion</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo"><ShieldCheck /></div>
          <div>
            <strong>Conecte RRHH</strong>
            <span>Administracion</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Modulos administrativos">
          <ModuleButton active={activeView === 'dashboard'} icon={<LayoutDashboard />} label="Dashboard" onClick={() => setActiveView('dashboard')} />
          <ModuleButton active={activeView === 'marcas'} icon={<FileText />} label="Marcas" onClick={() => setActiveView('marcas')} />
          <ModuleButton active={activeView === 'horas'} icon={<Calculator />} label="Calculo de horas" onClick={() => setActiveView('horas')} />
          <ModuleButton active={activeView === 'aprobacion'} icon={<ClipboardCheck />} label="Aprobacion de extras" onClick={() => setActiveView('aprobacion')} />
          <ModuleButton active={activeView === 'empleados'} icon={<UserCog />} label="Colaboradores" onClick={() => setActiveView('empleados')} />
          <ModuleButton active={activeView === 'configuracion'} icon={<Settings />} label="Configuracion" onClick={() => setActiveView('configuracion')} />
          <ModuleButton active={activeView === 'reportes'} icon={<FileBarChart2 />} label="Reportes" onClick={() => setActiveView('reportes')} />
        </nav>
      </aside>

      <main className="dashboard-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">Conecte RRHH</div>
            <h1>{getViewTitle(activeView)}</h1>
            <p>{getViewDescription(activeView)}</p>
          </div>

          <div className="topbar-actions">
            <div className="user-pill">
              <ShieldCheck />
              <span>{currentUserName}</span>
            </div>
            <button className="secondary-button" onClick={handleLogout}>
              <LogOut />
              <span>Salir</span>
            </button>
          </div>
        </header>

        {activeView === 'dashboard' ? (
          <>
            <section className="stats-grid">
              <StatCard label="Colaboradores activos" value={employees.filter((employee) => employee.is_active !== false).length} icon={<Users />} />
              <StatCard label="Marcas consultadas" value={stats.totalRecords} icon={<FileText />} />
              <StatCard label="Revision requerida" value={stats.pendingReview} icon={<ShieldAlert />} />
              <StatCard label="Extras sugeridas" value={stats.pendingOvertime} icon={<BarChart3 />} />
            </section>

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Resumen operativo</h2>
                  <p>El dashboard usa los resultados que consultes en Marcas o Calculo de horas. No carga registros masivos al entrar.</p>
                </div>
                <div className="toolbar">
                  <button className="primary-button" onClick={() => setActiveView('marcas')}>
                    <Search />
                    <span>Consultar marcas</span>
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : activeView === 'marcas' ? (
          <>
            <section className="stats-grid">
              <StatCard label="Registros" value={stats.totalRecords} icon={<FileText />} />
              <StatCard label="Empleados" value={stats.totalEmployees} icon={<Users />} />
              <StatCard label="Entradas" value={stats.totalEntries} icon={<CalendarDays />} />
              <StatCard label="Salidas" value={stats.totalExits} icon={<MapPinned />} />
            </section>

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Filtros de consulta</h2>
                  <p>Los resultados se agrupan por empleado y luego por fecha ascendente.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={refreshReport} disabled={isRefreshing}>
                    {isRefreshing ? <Loader2 className="spin" /> : <RefreshCcw />}
                    <span>{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
                  </button>
                  <button className="secondary-button" onClick={handleExportExcel} disabled={!filteredRecords.length}>
                    <FileSpreadsheet />
                    <span>Exportar Excel</span>
                  </button>
                  <button className="primary-button" onClick={handleExportPdf} disabled={!filteredRecords.length}>
                    <Download />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              </div>

              <div className="filter-grid">
                <EmployeeMultiSelect
                  label="Empleado"
                  employees={activeEmployees}
                  selectedEmployees={selectedEmployees}
                  setSelectedEmployees={setSelectedEmployees}
                />

                <label>
                  Fecha inicial
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>

                <label>
                  Fecha final
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>

                <label>
                  Buscar texto
                  <span className="input-shell">
                    <Search />
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Empleado, correo, ubicacion..."
                    />
                  </span>
                </label>
              </div>

              <div className="filter-actions">
                <button className="primary-button" onClick={refreshReport} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="spin" /> : <Search />}
                  <span>Aplicar filtros</span>
                </button>
              </div>
            </section>

            {errorMsg ? <div className="panel-error">{errorMsg}</div> : null}
            {markCorrectionError ? <div className="panel-error">{markCorrectionError}</div> : null}
            {markCorrectionFeedback ? <div className="panel-success">{markCorrectionFeedback}</div> : null}

            {isLoading ? (
              <div className="panel-loading">
                <Loader2 className="spin" />
                <span>Cargando registros desde Supabase...</span>
              </div>
            ) : groupedRecords.length ? (
              <section className="groups-stack">
                {groupedRecords.map((employeeGroup) => (
                  <article key={employeeGroup.userId} className="employee-card">
                    <div className="employee-card-header">
                      <div>
                        <h3>{employeeGroup.employeeName}</h3>
                        <p>{employeeGroup.employeeEmail}</p>
                      </div>
                      <span className="employee-count">{employeeGroup.total} registros</span>
                    </div>

                    <div className="dates-stack">
                      {employeeGroup.dates.map((dateGroup) => (
                        <section key={`${employeeGroup.userId}-${dateGroup.dateKey}`} className="date-card">
                          <div className="date-card-header">
                            <h4>{dateGroup.dateLabel}</h4>
                            <span>{dateGroup.records.length} movimientos</span>
                          </div>

                          <div className="table-shell">
                            <table>
                              <thead>
                                <tr>
                                  <th>Hora</th>
                                  <th>Tipo</th>
                                  <th>Ubicacion</th>
                                  <th>Descripcion</th>
                                  <th>Coordenadas</th>
                                  <th>IP</th>
                                  <th>Validacion supervisor</th>
                                  <th>Validacion RRHH</th>
                                  <th>Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dateGroup.records.map((record) => (
                                  <tr key={record.id}>
                                    <td>{record.timeLabel}</td>
                                    <td>
                                      <span className={`type-pill type-${record.tipo}`}>
                                        {record.tipo}
                                      </span>
                                    </td>
                                    <td>{record.ubicacion}</td>
                                    <td>{record.descripcion || 'Sin detalle'}</td>
                                    <td>
                                      {record.latitud && record.longitud ? (
                                        <a
                                          href={`https://www.google.com/maps?q=${record.latitud},${record.longitud}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="map-link"
                                        >
                                          {record.latitud}, {record.longitud}
                                        </a>
                                      ) : (
                                        'Sin coordenadas'
                                      )}
                                    </td>
                                    <td>{record.ip || 'Sin IP'}</td>
                                    <td>
                                      <span className={`status-pill validation-${record.supervisor_validation_status}`}>
                                        {formatSupervisorValidation(record.supervisor_validation_status)}
                                      </span>
                                      {record.supervisor_name ? (
                                        <div className="muted-cell">{record.supervisor_name}</div>
                                      ) : null}
                                    </td>
                                    <td>
                                      <span className={`status-pill validation-${record.hr_validation_status}`}>
                                        {formatHrValidation(record.hr_validation_status)}
                                      </span>
                                      {record.hr_admin_name ? (
                                        <div className="muted-cell">{record.hr_admin_name}</div>
                                      ) : null}
                                      {record.hr_validation_comment ? (
                                        <div className="muted-cell">{record.hr_validation_comment}</div>
                                      ) : null}
                                    </td>
                                    <td>
                                      <div className="row-actions">
                                        <button
                                          className="secondary-button compact-action"
                                          type="button"
                                          onClick={() => openMarkCorrectionModal(record)}
                                        >
                                          <PencilLine />
                                          <span>Corregir</span>
                                        </button>
                                        <button
                                          className="secondary-button compact-action"
                                          type="button"
                                          onClick={() => handleHrMarkValidation(record, 'confirmed')}
                                          disabled={validatingMarkId === record.id}
                                        >
                                          {validatingMarkId === record.id ? <Loader2 className="spin" /> : <ShieldCheck />}
                                          <span>Confirmar</span>
                                        </button>
                                        <button
                                          className="secondary-button compact-action"
                                          type="button"
                                          onClick={() => handleHrMarkValidation(record, 'rejected')}
                                          disabled={validatingMarkId === record.id}
                                        >
                                          <X />
                                          <span>Rechazar</span>
                                        </button>
                                        <button
                                          className="secondary-button compact-action"
                                          type="button"
                                          onClick={() => handleHrMarkValidation(record, 'duplicated')}
                                          disabled={validatingMarkId === record.id}
                                        >
                                          <ClipboardCheck />
                                          <span>Duplicada</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <div className="empty-state">
                <h3>No hay registros para los filtros actuales</h3>
                <p>Prueba ampliando el rango de fechas o seleccionando otro empleado.</p>
              </div>
            )}
          </>
        ) : activeView === 'horas' ? (
          <>
            <ConsultationFilters
              employees={activeEmployees}
              selectedEmployees={selectedEmployees}
              setSelectedEmployees={setSelectedEmployees}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              searchText={searchText}
              setSearchText={setSearchText}
              onSearch={refreshReport}
              isRefreshing={isRefreshing}
            />

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Calculo inicial por dia</h2>
                  <p>Interpretacion por dia usando las reglas configuradas. Puedes guardar el resultado para auditoria y aprobaciones.</p>
                </div>
                <div className="toolbar">
                  <button
                    className="secondary-button"
                    onClick={() => handleBackendHourCalculation({ persistResults: false })}
                    disabled={isBackendCalculating}
                  >
                    {isBackendCalculating ? <Loader2 className="spin" /> : <Calculator />}
                    <span>{isBackendCalculating ? 'Calculando...' : 'Calcular backend'}</span>
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => handleBackendHourCalculation({ persistResults: true })}
                    disabled={isBackendCalculating}
                  >
                    {isBackendCalculating ? <Loader2 className="spin" /> : <ShieldCheck />}
                    <span>Calcular y guardar backend</span>
                  </button>
                  <button
                    className="primary-button"
                    onClick={handleSaveHourCalculations}
                    disabled={!calculatedRows.length || isCalculationSaving}
                  >
                    {isCalculationSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
                    <span>{isCalculationSaving ? 'Guardando...' : 'Guardar calculos'}</span>
                  </button>
                </div>
              </div>
              {calculationError ? <div className="panel-error">{calculationError}</div> : null}
              {calculationFeedback ? <div className="panel-success">{calculationFeedback}</div> : null}
              <HoursTable rows={calculatedRows} emptyTitle="Consulta marcas para calcular horas" />
            </section>
          </>
        ) : activeView === 'aprobacion' ? (
          <>
            <ConsultationFilters
              employees={activeEmployees}
              selectedEmployees={selectedEmployees}
              setSelectedEmployees={setSelectedEmployees}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              searchText={searchText}
              setSearchText={setSearchText}
              onSearch={refreshReport}
              isRefreshing={isRefreshing}
            />

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Horas extra pendientes</h2>
                  <p>Flujo inicial de revision. La aprobacion persistente queda preparada para la tabla de aprobaciones.</p>
                </div>
              </div>
              {approvalError ? <div className="panel-error">{approvalError}</div> : null}
              {approvalFeedback ? <div className="panel-success">{approvalFeedback}</div> : null}
              <ApprovalTable
                rows={calculatedRows.filter((row) => row.overtimeHours > 0 || row.doubleHours > 0)}
                onStatusChange={handleApprovalStatusChange}
                onOpenDetail={openApprovalDetail}
                isSaving={isApprovalSaving}
              />
            </section>
          </>
        ) : activeView === 'reportes' ? (
          <>
            <section className="stats-grid">
              <StatCard label="Horas trabajadas" value={formatHours(calculatedRows.reduce((sum, row) => sum + row.workedHours, 0))} icon={<Clock />} />
              <StatCard label="Horas ordinarias" value={formatHours(calculatedRows.reduce((sum, row) => sum + row.regularHours, 0))} icon={<CalendarDays />} />
              <StatCard label="Horas extra" value={formatHours(calculatedRows.reduce((sum, row) => sum + row.overtimeHours, 0))} icon={<BarChart3 />} />
              <StatCard label="Horas dobles" value={formatHours(calculatedRows.reduce((sum, row) => sum + row.doubleHours, 0))} icon={<ShieldAlert />} />
            </section>

            <ConsultationFilters
              employees={activeEmployees}
              selectedEmployees={selectedEmployees}
              setSelectedEmployees={setSelectedEmployees}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              searchText={searchText}
              setSearchText={setSearchText}
              onSearch={refreshHoursSummaryReport}
              isRefreshing={isSummaryLoading}
            />

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Resumen persistido de horas</h2>
                  <p>Consulta totales por colaborador, incluyendo aprobaciones e inconsistencias.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={handleExportExcel} disabled={!filteredRecords.length}>
                    <FileSpreadsheet />
                    <span>Marcas Excel</span>
                  </button>
                  <button className="primary-button" onClick={handleExportPdf} disabled={!filteredRecords.length}>
                    <Download />
                    <span>Marcas PDF</span>
                  </button>
                  <button className="primary-button" onClick={handleExportHoursSummary} disabled={!hoursSummaryRows.length}>
                    <FileSpreadsheet />
                    <span>Horas Excel</span>
                  </button>
                </div>
              </div>
              {summaryError ? <div className="panel-error">{summaryError}</div> : null}
              <HoursSummaryTable rows={hoursSummaryRows} isLoading={isSummaryLoading} />
            </section>

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Reporte para planilla</h2>
                  <p>Ordinarias guardadas y extras/dobles aprobadas para pago, con pendientes separadas.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={refreshPayrollExportReport} disabled={isPayrollExportLoading}>
                    {isPayrollExportLoading ? <Loader2 className="spin" /> : <Search />}
                    <span>Cargar planilla</span>
                  </button>
                  <button className="primary-button" onClick={handleExportPayrollReport} disabled={!payrollExportRows.length}>
                    <FileSpreadsheet />
                    <span>Planilla Excel</span>
                  </button>
                </div>
              </div>
              {payrollExportError ? <div className="panel-error">{payrollExportError}</div> : null}
              <PayrollExportTable rows={payrollExportRows} isLoading={isPayrollExportLoading} />
            </section>

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Bitacora de aprobaciones</h2>
                  <p>Historial de cambios aplicados a horas extra y dobles para auditoria administrativa.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={() => refreshApprovalAudit()} disabled={isApprovalAuditLoading}>
                    {isApprovalAuditLoading ? <Loader2 className="spin" /> : <Search />}
                    <span>Cargar bitacora</span>
                  </button>
                  <button className="primary-button" onClick={handleExportApprovalAudit} disabled={!approvalAuditRows.length}>
                    <FileSpreadsheet />
                    <span>Auditoria Excel</span>
                  </button>
                </div>
              </div>
              {approvalAuditError ? <div className="panel-error">{approvalAuditError}</div> : null}
              <ApprovalAuditTable rows={approvalAuditRows} isLoading={isApprovalAuditLoading} />
            </section>

            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Bitacora de correcciones de marcas</h2>
                  <p>Historial de ajustes administrativos sobre marcas originales, con motivo y responsable.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={() => refreshMarkAudit()} disabled={isMarkAuditLoading}>
                    {isMarkAuditLoading ? <Loader2 className="spin" /> : <Search />}
                    <span>Cargar correcciones</span>
                  </button>
                  <button className="primary-button" onClick={handleExportMarkAudit} disabled={!markAuditRows.length}>
                    <FileSpreadsheet />
                    <span>Correcciones Excel</span>
                  </button>
                </div>
              </div>
              {markAuditError ? <div className="panel-error">{markAuditError}</div> : null}
              <MarkAuditTable rows={markAuditRows} isLoading={isMarkAuditLoading} />
            </section>
          </>
        ) : activeView === 'empleados' ? (
          <>
            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Administracion de empleados</h2>
                  <p>Crea, edita o elimina cuentas y define quienes son administradores de RRHH.</p>
                </div>
                <div className="toolbar">
                  <label className="checkbox-row toolbar-checkbox">
                    <input
                      type="checkbox"
                      checked={showInactiveEmployees}
                      onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                    />
                    <span>Mostrar inactivos</span>
                  </label>
                  <button
                    className="secondary-button"
                    onClick={refreshDirectory}
                    disabled={isEmployeeDirectoryRefreshing}
                  >
                    {isEmployeeDirectoryRefreshing ? <Loader2 className="spin" /> : <RefreshCcw />}
                    <span>{isEmployeeDirectoryRefreshing ? 'Recargando...' : 'Recargar lista'}</span>
                  </button>
                  <button className="primary-button" onClick={openCreateEmployeeModal}>
                    <UserPlus />
                    <span>Nuevo empleado</span>
                  </button>
                </div>
              </div>

              {employeeError ? <div className="panel-error">{employeeError}</div> : null}
              {employeeFeedback ? <div className="panel-success">{employeeFeedback}</div> : null}
            </section>

            <section className="employee-admin-list">
              {visibleEmployees.map((employee) => (
                <article key={employee.user_id} className="employee-admin-card">
                  <div className="employee-admin-main">
                    <div>
                      <h3>{employee.display_name}</h3>
                      <p>{employee.email}</p>
                    </div>
                    <div className="employee-admin-badges">
                      <span className={employee.is_admin ? 'status-pill status-admin' : employee.is_supervisor ? 'status-pill status-supervisor' : 'status-pill'}>
                        {employee.is_admin ? 'Admin RRHH' : employee.is_supervisor ? 'Supervisor' : 'Empleado'}
                      </span>
                      <span className={employee.is_active ? 'status-pill status-active' : 'status-pill status-inactive'}>
                        {employee.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                  <div className="employee-admin-meta">
                    <span>Creado: {employee.created_at ? DATE_TIME_FORMATTER.format(new Date(employee.created_at)) : 'Sin fecha'}</span>
                    <span>Cedula: {employee.identification || 'Sin registrar'}</span>
                    <span>Puesto: {employee.position || employee.job_position || 'Sin registrar'}</span>
                    <span>Ingreso: {employee.hire_date || 'Sin fecha'}</span>
                    <span>Supervisor: {employee.supervisor_name || 'Sin asignar'}</span>
                  </div>
                  <div className="employee-admin-actions">
                    <button className="secondary-button" onClick={() => openEditEmployeeModal(employee)}>
                      <PencilLine />
                      <span>Editar perfil</span>
                    </button>
                    {employee.is_supervisor ? (
                      <button className="secondary-button" onClick={() => openSupervisorTeamModal(employee)}>
                        <UserCheck />
                        <span>Personal a cargo</span>
                      </button>
                    ) : null}
                    {employee.is_active === false ? (
                      <button
                        className="primary-button"
                        onClick={() => handleEmployeeReactivate(employee)}
                        disabled={isEmployeeSaving}
                      >
                        <ShieldCheck />
                        <span>Reactivar</span>
                      </button>
                    ) : (
                      <button
                        className="danger-button"
                        onClick={() => handleEmployeeDelete(employee)}
                        disabled={isEmployeeSaving || employee.user_id === session.user.id}
                      >
                        <Trash2 />
                        <span>Inactivar</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!visibleEmployees.length ? (
                <div className="empty-state">No hay empleados para mostrar con el filtro actual.</div>
              ) : null}
            </section>
          </>
        ) : activeView === 'configuracion' ? (
          <>
            <section className="configuration-menu" aria-label="Secciones de configuracion">
              <button
                type="button"
                className={configSection === 'jornada' ? 'configuration-option active' : 'configuration-option'}
                onClick={() => setConfigSection('jornada')}
              >
                <Clock />
                <span>
                  <strong>Reglas de jornada</strong>
                  <small>Horario, almuerzo, tolerancias y horas extra</small>
                </span>
              </button>
              <button
                type="button"
                className={configSection === 'planilla' ? 'configuration-option active' : 'configuration-option'}
                onClick={() => setConfigSection('planilla')}
              >
                <CalendarDays />
                <span>
                  <strong>Cierre de planilla</strong>
                  <small>Periodos cerrados y reaperturas</small>
                </span>
              </button>
              <button
                type="button"
                className={configSection === 'lugares' ? 'configuration-option active' : 'configuration-option'}
                onClick={() => setConfigSection('lugares')}
              >
                <MapPinned />
                <span>
                  <strong>Lugares de marca</strong>
                  <small>Ubicaciones disponibles para asistencia</small>
                </span>
              </button>
            </section>

            {configSection === 'jornada' ? (
            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Reglas de asistencia y horas</h2>
                  <p>Parametros configurables por empresa para ordinarias, extras, dobles, almuerzo y aprobaciones.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={() => refreshAttendanceSettings({ silentFallback: false })}>
                    <RefreshCcw />
                    <span>Recargar reglas</span>
                  </button>
                </div>
              </div>

              {settingsError ? <div className="panel-error">{settingsError}</div> : null}
              {settingsFeedback ? <div className="panel-success">{settingsFeedback}</div> : null}

              <SettingsForm
                settings={attendanceSettings}
                setSettings={setAttendanceSettings}
                onSubmit={handleAttendanceSettingsSave}
                isSaving={isSettingsSaving}
              />
            </section>
            ) : null}

            {configSection === 'planilla' ? (
            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Cierre de planilla</h2>
                  <p>Bloquea rangos ya revisados para evitar correcciones, aprobaciones o recalculos accidentales.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={() => refreshPayrollPeriods()} disabled={isPayrollPeriodSaving}>
                    {isPayrollPeriodSaving ? <Loader2 className="spin" /> : <RefreshCcw />}
                    <span>Recargar periodos</span>
                  </button>
                </div>
              </div>

              {payrollPeriodError ? <div className="panel-error">{payrollPeriodError}</div> : null}
              {payrollPeriodFeedback ? <div className="panel-success">{payrollPeriodFeedback}</div> : null}

              <PayrollPeriodForm
                form={payrollPeriodForm}
                setForm={setPayrollPeriodForm}
                onSubmit={handlePayrollPeriodClose}
                isSaving={isPayrollPeriodSaving}
              />

              <PayrollPeriodsTable
                periods={payrollPeriods}
                onReopen={handlePayrollPeriodReopen}
                isSaving={isPayrollPeriodSaving}
              />
            </section>
            ) : null}

            {configSection === 'lugares' ? (
            <>
            <section className="filter-panel">
              <div className="filter-panel-header">
                <div>
                  <h2>Lugares de marca</h2>
                  <p>Administra los lugares disponibles para registrar asistencia.</p>
                </div>
                <div className="toolbar">
                  <button className="secondary-button" onClick={refreshLocations}>
                    <RefreshCcw />
                    <span>Recargar lista</span>
                  </button>
                  <button className="primary-button" onClick={openCreateLocationModal}>
                    <MapPinned />
                    <span>Nuevo lugar</span>
                  </button>
                </div>
              </div>

              {locationError ? <div className="panel-error">{locationError}</div> : null}
              {locationFeedback ? <div className="panel-success">{locationFeedback}</div> : null}
            </section>

            <section className="employee-admin-list">
              {locations.length ? (
                locations.map((location) => (
                  <article key={location.id} className="employee-admin-card">
                    <div className="employee-admin-main">
                      <div>
                        <h3>{location.name}</h3>
                        <p>
                          {location.requires_description
                            ? 'Solicita descripcion adicional'
                            : 'No requiere descripcion extra'}
                        </p>
                      </div>
                      <div className="employee-admin-badges">
                        <span className={location.is_active ? 'status-pill status-active' : 'status-pill status-inactive'}>
                          {location.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                        {location.is_system ? <span className="status-pill">Sistema</span> : null}
                        <span className="status-pill">Orden {location.sort_order}</span>
                      </div>
                    </div>
                    <div className="employee-admin-meta">
                      <span>
                        Actualizado: {location.updated_at ? DATE_TIME_FORMATTER.format(new Date(location.updated_at)) : 'Sin fecha'}
                      </span>
                    </div>
                    <div className="employee-admin-actions">
                      <button className="secondary-button" onClick={() => openEditLocationModal(location)} disabled={location.is_system}>
                        <PencilLine />
                        <span>Editar</span>
                      </button>
                      <button className="danger-button" onClick={() => handleLocationDelete(location)} disabled={isLocationSaving || location.is_system}>
                        <Trash2 />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <h3>No hay lugares configurados todavia</h3>
                  <p>Puedes crear el primer lugar con el boton "Nuevo lugar" o recargar despues de ejecutar el SQL en Supabase.</p>
                </div>
              )}
            </section>
            </>
            ) : null}
          </>
        ) : null}

        {isEmployeeModalOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={closeEmployeeModal}>
            <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>{employeeForm.userId ? 'Editar empleado' : 'Crear empleado'}</h3>
                  <p>
                    {employeeForm.userId
                      ? 'Actualiza datos, permisos o contrasena.'
                      : 'Crea la cuenta inicial del empleado con acceso al sistema.'}
                  </p>
                </div>
                <button className="icon-button" type="button" onClick={closeEmployeeModal}>
                  <X />
                </button>
              </div>

              <form className="employee-form-grid" onSubmit={handleEmployeeSave}>
                <label>
                  Correo
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, email: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  Nombre
                  <input
                    type="text"
                    value={employeeForm.nombre}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, nombre: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  Apellidos
                  <input
                    type="text"
                    value={employeeForm.apellidos}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, apellidos: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  Identificacion / cedula
                  <input
                    type="text"
                    value={employeeForm.identification}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, identification: e.target.value }))}
                    placeholder="Ej. 1-1111-1111"
                  />
                </label>

                <label>
                  Telefono
                  <input
                    type="tel"
                    value={employeeForm.phone}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, phone: e.target.value }))}
                    placeholder="Ej. 8888-8888"
                  />
                </label>

                <label>
                  Puesto
                  <input
                    type="text"
                    value={employeeForm.position}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, position: e.target.value }))}
                    placeholder="Ej. Operario"
                  />
                </label>

                <label>
                  Fecha de ingreso
                  <input
                    type="date"
                    value={employeeForm.hireDate}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, hireDate: e.target.value }))}
                  />
                </label>

                <label>
                  {employeeForm.userId ? 'Nueva contrasena (opcional)' : 'Contrasena temporal'}
                  <input
                    type="text"
                    value={employeeForm.password}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, password: e.target.value }))}
                    placeholder={employeeForm.userId ? 'Solo si deseas cambiarla' : 'Minimo 6 caracteres'}
                    required={!employeeForm.userId}
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={employeeForm.isAdmin}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, isAdmin: e.target.checked }))}
                  />
                  <span>Permitir acceso a RRHH como administrador</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={employeeForm.isSupervisor}
                    disabled={employeeForm.isAdmin}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, isSupervisor: e.target.checked }))}
                  />
                  <span>Asignar rol Supervisor</span>
                </label>

                <label>
                  Supervisor a cargo
                  <select
                    value={employeeForm.supervisorUserId}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, supervisorUserId: e.target.value }))}
                  >
                    <option value="">Sin supervisor</option>
                    {employees
                      .filter((employee) => employee.is_active !== false && employee.is_supervisor && employee.user_id !== employeeForm.userId)
                      .map((employee) => (
                        <option key={employee.user_id} value={employee.user_id}>
                          {employee.display_name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={employeeForm.isActive}
                    onChange={(e) => setEmployeeForm((current) => ({ ...current, isActive: e.target.checked }))}
                  />
                  <span>Cuenta activa</span>
                </label>

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeEmployeeModal}>
                    <X />
                    <span>Cancelar</span>
                  </button>
                  <button type="submit" className="primary-button" disabled={isEmployeeSaving}>
                    {isEmployeeSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
                    <span>{isEmployeeSaving ? 'Guardando...' : 'Guardar empleado'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {teamSupervisor ? (
          <div className="modal-backdrop" role="presentation" onClick={closeSupervisorTeamModal}>
            <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Personal a cargo</h3>
                  <p>Supervisor: {teamSupervisor.display_name}</p>
                </div>
                <button className="icon-button" type="button" onClick={closeSupervisorTeamModal}>
                  <X />
                </button>
              </div>

              <div className="team-assignment-list">
                {employees
                  .filter((employee) => employee.is_active !== false && employee.user_id !== teamSupervisor.user_id)
                  .map((employee) => {
                    const assignedToAnother =
                      employee.supervisor_user_id &&
                      employee.supervisor_user_id !== teamSupervisor.user_id;
                    return (
                      <label key={employee.user_id} className="team-assignment-row">
                        <input
                          type="checkbox"
                          checked={teamEmployeeIds.includes(employee.user_id)}
                          disabled={assignedToAnother || isTeamSaving}
                          onChange={(event) => setTeamEmployeeIds((current) =>
                            event.target.checked
                              ? [...current, employee.user_id]
                              : current.filter((id) => id !== employee.user_id)
                          )}
                        />
                        <span>
                          <strong>{employee.display_name}</strong>
                          <small>
                            {assignedToAnother
                              ? `Asignado a ${employee.supervisor_name}`
                              : employee.email}
                          </small>
                        </span>
                      </label>
                    );
                  })}
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeSupervisorTeamModal} disabled={isTeamSaving}>
                  <X />
                  <span>Cancelar</span>
                </button>
                <button type="button" className="primary-button" onClick={handleSupervisorTeamSave} disabled={isTeamSaving}>
                  {isTeamSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
                  <span>{isTeamSaving ? 'Guardando...' : 'Guardar asignaciones'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isLocationModalOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={closeLocationModal}>
            <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>{locationForm.id ? 'Editar lugar' : 'Crear lugar'}</h3>
                  <p>Configura los lugares disponibles para marcar asistencia.</p>
                </div>
                <button className="icon-button" type="button" onClick={closeLocationModal}>
                  <X />
                </button>
              </div>

              <form className="employee-form-grid" onSubmit={handleLocationSave}>
                {locationError ? <div className="panel-error modal-message">{locationError}</div> : null}

                <label>
                  Nombre del lugar
                  <input
                    type="text"
                    value={locationForm.name}
                    onChange={(e) => setLocationForm((current) => ({ ...current, name: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  Orden
                  <input
                    type="number"
                    value={locationForm.sortOrder}
                    onChange={(e) => setLocationForm((current) => ({ ...current, sortOrder: e.target.value }))}
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={locationForm.requiresDescription}
                    onChange={(e) => setLocationForm((current) => ({ ...current, requiresDescription: e.target.checked }))}
                  />
                  <span>Solicitar descripcion adicional cuando el usuario marque este lugar</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={locationForm.isActive}
                    onChange={(e) => setLocationForm((current) => ({ ...current, isActive: e.target.checked }))}
                  />
                  <span>Lugar activo</span>
                </label>

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeLocationModal}>
                    <X />
                    <span>Cancelar</span>
                  </button>
                  <button type="submit" className="primary-button" disabled={isLocationSaving}>
                    {isLocationSaving ? <Loader2 className="spin" /> : <SlidersHorizontal />}
                    <span>{isLocationSaving ? 'Guardando...' : 'Guardar lugar'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isMarkCorrectionModalOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={closeMarkCorrectionModal}>
            <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Corregir marca</h3>
                  <p>{markCorrectionForm.employeeName}</p>
                </div>
                <button className="icon-button" type="button" onClick={closeMarkCorrectionModal}>
                  <X />
                </button>
              </div>

              <form className="employee-form-grid" onSubmit={handleMarkCorrectionSave}>
                {markCorrectionError ? <div className="panel-error modal-message">{markCorrectionError}</div> : null}

                <label>
                  Tipo
                  <select
                    value={markCorrectionForm.tipo}
                    onChange={(event) => setMarkCorrectionForm((current) => ({ ...current, tipo: event.target.value }))}
                    required
                  >
                    {MARK_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Fecha
                  <input
                    type="date"
                    value={markCorrectionForm.date}
                    onChange={(event) => setMarkCorrectionForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  Hora
                  <input
                    type="time"
                    value={markCorrectionForm.time}
                    onChange={(event) => setMarkCorrectionForm((current) => ({ ...current, time: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  Ubicacion
                  <input
                    type="text"
                    value={markCorrectionForm.ubicacion}
                    onChange={(event) => setMarkCorrectionForm((current) => ({ ...current, ubicacion: event.target.value }))}
                    required
                  />
                </label>

                <label className="full-span">
                  Descripcion
                  <textarea
                    value={markCorrectionForm.descripcion}
                    onChange={(event) => setMarkCorrectionForm((current) => ({ ...current, descripcion: event.target.value }))}
                    rows="3"
                    placeholder="Detalle visible en la marca corregida"
                  />
                </label>

                <label className="full-span">
                  Motivo de correccion
                  <textarea
                    value={markCorrectionForm.reason}
                    onChange={(event) => setMarkCorrectionForm((current) => ({ ...current, reason: event.target.value }))}
                    rows="3"
                    placeholder="Ej. El colaborador marco salida en vez de salida a almuerzo."
                    required
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeMarkCorrectionModal}>
                    <X />
                    <span>Cancelar</span>
                  </button>
                  <button type="submit" className="primary-button" disabled={isMarkCorrectionSaving}>
                    {isMarkCorrectionSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
                    <span>{isMarkCorrectionSaving ? 'Guardando...' : 'Guardar correccion'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {approvalDetailRow ? (
          <div className="modal-backdrop" role="presentation" onClick={closeApprovalDetail}>
            <div className="modal-card approval-detail-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Detalle de horas extra</h3>
                  <p>{approvalDetailRow.employeeName} - {approvalDetailRow.dateLabel}</p>
                </div>
                <button className="icon-button" type="button" onClick={closeApprovalDetail}>
                  <X />
                </button>
              </div>

              <div className="approval-detail-grid">
                <DetailItem label="Entrada" value={approvalDetailRow.entry || 'Sin marca'} />
                <DetailItem label="Salida almuerzo" value={approvalDetailRow.lunchOut || 'No aplica'} />
                <DetailItem label="Entrada almuerzo" value={approvalDetailRow.lunchIn || 'No aplica'} />
                <DetailItem label="Salida final" value={approvalDetailRow.exit || 'Sin marca'} />
                <DetailItem label="Trabajadas" value={formatHours(approvalDetailRow.workedHours)} />
                <DetailItem label="Ordinarias" value={formatHours(approvalDetailRow.regularHours)} />
                <DetailItem label="Extra sugerida" value={formatHours(approvalDetailRow.overtimeHours)} />
                <DetailItem label="Doble sugerida" value={formatHours(approvalDetailRow.doubleHours)} />
                <DetailItem label="Estado calculo" value={approvalDetailRow.status} />
                <DetailItem label="Estado aprobacion" value={getApprovalStatusLabel(approvalDetailRow.approvalStatus)} />
              </div>

              <div className="approval-notes-box">
                <h4>Observaciones</h4>
                <p>{approvalDetailRow.notes.join(', ')}</p>
              </div>

              <label className="approval-comment-field">
                Comentario de revision
                <textarea
                  rows="4"
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  placeholder="Agrega el motivo de aprobacion, rechazo o correccion..."
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeApprovalDetail} disabled={isApprovalSaving}>
                  <X />
                  <span>Cerrar</span>
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleApprovalStatusChange(approvalDetailRow, 'requires_correction', approvalComment)}
                  disabled={isApprovalSaving}
                >
                  <PencilLine />
                  <span>Solicitar correccion</span>
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => handleApprovalStatusChange(approvalDetailRow, 'rejected', approvalComment)}
                  disabled={isApprovalSaving}
                >
                  <X />
                  <span>Rechazar</span>
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => handleApprovalStatusChange(approvalDetailRow, 'approved', approvalComment)}
                  disabled={isApprovalSaving}
                >
                  {isApprovalSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
                  <span>{isApprovalSaving ? 'Guardando...' : 'Aprobar'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ModuleButton({ active, icon, label, onClick }) {
  return (
    <button className={active ? 'sidebar-link active' : 'sidebar-link'} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EmployeeMultiSelect({ label, employees, selectedEmployees, setSelectedEmployees }) {
  const selectedCount = selectedEmployees.length;
  const summary = selectedCount
    ? `${selectedCount} seleccionado${selectedCount === 1 ? '' : 's'}`
    : 'Todos';

  const toggleEmployee = (userId) => {
    setSelectedEmployees((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  return (
    <div className="employee-multi-field">
      <div className="employee-multi-label">
        <span>{label}</span>
      </div>
      <details className="employee-multi-filter">
        <summary>
          <span>{summary}</span>
        </summary>
        <div className="employee-multi-popover">
          <button type="button" className="employee-multi-all" onClick={() => setSelectedEmployees([])}>
            Todos
          </button>
          <div className="employee-multi-list">
            {employees.map((employee) => (
              <label key={employee.user_id} className="employee-multi-option">
                <input
                  type="checkbox"
                  checked={selectedEmployees.includes(employee.user_id)}
                  onChange={() => toggleEmployee(employee.user_id)}
                />
                <span>{employee.display_name}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function ConsultationFilters({
  employees,
  selectedEmployees,
  setSelectedEmployees,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  searchText,
  setSearchText,
  onSearch,
  isRefreshing,
}) {
  return (
    <section className="filter-panel">
      <div className="filter-panel-header">
        <div>
          <h2>Filtros de consulta</h2>
          <p>Define el rango y presiona Buscar para cargar resultados desde Supabase.</p>
        </div>
        <div className="toolbar">
          <button className="primary-button" onClick={onSearch} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="spin" /> : <Search />}
            <span>{isRefreshing ? 'Consultando...' : 'Buscar'}</span>
          </button>
        </div>
      </div>

      <div className="filter-grid">
        <EmployeeMultiSelect
          label="Colaborador"
          employees={employees}
          selectedEmployees={selectedEmployees}
          setSelectedEmployees={setSelectedEmployees}
        />

        <label>
          Fecha inicial
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>

        <label>
          Fecha final
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>

        <label>
          Buscar texto
          <span className="input-shell">
            <Search />
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Nombre, correo, ubicacion..."
            />
          </span>
        </label>
      </div>
    </section>
  );
}

function SettingsForm({ settings, setSettings, onSubmit, isSaving }) {
  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      <div className="settings-section">
        <h3>Empresa y modalidad</h3>
        <div className="settings-grid">
          <label>
            Nombre de empresa
            <input
              value={settings.company_name}
              onChange={(event) => updateSetting('company_name', event.target.value)}
            />
          </label>

          <label>
            Modalidad de calculo
            <select
              value={settings.calculation_mode}
              onChange={(event) => updateSetting('calculation_mode', event.target.value)}
            >
              <option value="weekly">Semanal</option>
              <option value="biweekly">Bisemanal</option>
              <option value="monthly_fixed">Mensual con horario fijo</option>
            </select>
          </label>

          <label>
            Tipo de periodo
            <select
              value={settings.period_type}
              onChange={(event) => updateSetting('period_type', event.target.value)}
            >
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Bisemanal</option>
              <option value="monthly">Mensual</option>
            </select>
          </label>

          <label>
            Regla de redondeo
            <select
              value={settings.rounding_rule}
              onChange={(event) => updateSetting('rounding_rule', event.target.value)}
            >
              <option value="none">Sin redondeo</option>
              <option value="nearest_15">Mas cercano a 15 min</option>
              <option value="nearest_30">Mas cercano a 30 min</option>
              <option value="up_15">Hacia arriba a 15 min</option>
              <option value="up_30">Hacia arriba a 30 min</option>
            </select>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>Horario y almuerzo</h3>
        <div className="settings-grid">
          <label>
            Hora entrada
            <input
              type="time"
              value={settings.start_time || ''}
              onChange={(event) => updateSetting('start_time', event.target.value)}
            />
          </label>

          <label>
            Hora salida
            <input
              type="time"
              value={settings.end_time || ''}
              onChange={(event) => updateSetting('end_time', event.target.value)}
            />
          </label>

          <label>
            Almuerzo minutos
            <input
              type="number"
              min="0"
              value={settings.lunch_minutes}
              onChange={(event) => updateSetting('lunch_minutes', event.target.value)}
            />
          </label>

          <label>
            Minimo para extra
            <input
              type="number"
              min="0"
              value={settings.overtime_minimum_minutes}
              onChange={(event) => updateSetting('overtime_minimum_minutes', event.target.value)}
            />
          </label>

          <label className="checkbox-row compact-checkbox">
            <input
              type="checkbox"
              checked={settings.requires_lunch_out}
              onChange={(event) => updateSetting('requires_lunch_out', event.target.checked)}
            />
            <span>Requiere salida a almuerzo</span>
          </label>

          <label className="checkbox-row compact-checkbox">
            <input
              type="checkbox"
              checked={settings.requires_lunch_in}
              onChange={(event) => updateSetting('requires_lunch_in', event.target.checked)}
            />
            <span>Requiere entrada de almuerzo</span>
          </label>

          <label className="checkbox-row compact-checkbox">
            <input
              type="checkbox"
              checked={settings.auto_deduct_lunch}
              onChange={(event) => updateSetting('auto_deduct_lunch', event.target.checked)}
            />
            <span>Descontar almuerzo automaticamente</span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>Ordinarias, extras y dobles</h3>
        <div className="settings-grid">
          <label>
            Ordinarias por dia
            <input
              type="number"
              min="0"
              step="0.25"
              value={settings.daily_regular_hours}
              onChange={(event) => updateSetting('daily_regular_hours', event.target.value)}
            />
          </label>

          <label>
            Ordinarias por semana
            <input
              type="number"
              min="0"
              step="0.25"
              value={settings.weekly_regular_hours}
              onChange={(event) => updateSetting('weekly_regular_hours', event.target.value)}
            />
          </label>

          <label>
            Ordinarias por bisemana
            <input
              type="number"
              min="0"
              step="0.25"
              value={settings.biweekly_regular_hours}
              onChange={(event) => updateSetting('biweekly_regular_hours', event.target.value)}
            />
          </label>

          <label>
            Extras antes de doble
            <input
              type="number"
              min="0"
              step="0.25"
              value={settings.daily_overtime_before_double}
              onChange={(event) => updateSetting('daily_overtime_before_double', event.target.value)}
            />
          </label>

          <label>
            Domingo
            <select
              value={settings.sunday_rule}
              onChange={(event) => updateSetting('sunday_rule', event.target.value)}
            >
              <option value="ordinary">Ordinario</option>
              <option value="overtime">Extra</option>
              <option value="double">Doble</option>
              <option value="rest_day">Dia de descanso</option>
              <option value="holiday">Feriado</option>
              <option value="configurable">Configurable</option>
            </select>
          </label>

          <label>
            Feriado
            <select
              value={settings.holiday_rule}
              onChange={(event) => updateSetting('holiday_rule', event.target.value)}
            >
              <option value="ordinary">Ordinario</option>
              <option value="overtime">Extra</option>
              <option value="double">Doble</option>
              <option value="configurable">Configurable</option>
            </select>
          </label>

          <label className="checkbox-row compact-checkbox">
            <input
              type="checkbox"
              checked={settings.requires_overtime_approval}
              onChange={(event) => updateSetting('requires_overtime_approval', event.target.checked)}
            />
            <span>Requiere aprobacion de extras</span>
          </label>

          <label className="checkbox-row compact-checkbox">
            <input
              type="checkbox"
              checked={settings.requires_second_approval}
              onChange={(event) => updateSetting('requires_second_approval', event.target.checked)}
            />
            <span>Requiere segunda aprobacion</span>
          </label>
        </div>
      </div>

      <div className="settings-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
          <span>{isSaving ? 'Guardando...' : 'Guardar reglas'}</span>
        </button>
      </div>
    </form>
  );
}

function PayrollPeriodForm({ form, setForm, onSubmit, isSaving }) {
  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <form className="settings-form payroll-period-form" onSubmit={onSubmit}>
      <div className="settings-grid">
        <label>
          Nombre del periodo
          <input
            value={form.periodName}
            onChange={(event) => updateForm('periodName', event.target.value)}
            placeholder="Ej. Planilla 1-15 junio"
            required
          />
        </label>

        <label>
          Fecha inicial
          <input
            type="date"
            value={form.startDate}
            onChange={(event) => updateForm('startDate', event.target.value)}
            required
          />
        </label>

        <label>
          Fecha final
          <input
            type="date"
            value={form.endDate}
            onChange={(event) => updateForm('endDate', event.target.value)}
            required
          />
        </label>

        <label>
          Nota
          <input
            value={form.notes}
            onChange={(event) => updateForm('notes', event.target.value)}
            placeholder="Referencia interna opcional"
          />
        </label>
      </div>

      <div className="settings-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="spin" /> : <ShieldCheck />}
          <span>{isSaving ? 'Cerrando...' : 'Cerrar periodo'}</span>
        </button>
      </div>
    </form>
  );
}

function PayrollPeriodsTable({ periods, onReopen, isSaving }) {
  if (!periods.length) {
    return (
      <div className="empty-state compact">
        <h3>No hay periodos registrados</h3>
        <p>Cierra un rango despues de revisar marcas, calculos y aprobaciones.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Rango</th>
            <th>Estado</th>
            <th>Cerrado por</th>
            <th>Reapertura</th>
            <th>Nota</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <td><strong>{period.period_name}</strong></td>
              <td>{period.start_date} a {period.end_date}</td>
              <td>
                <span className={period.status === 'closed' ? 'status-pill status-inactive' : 'status-pill status-warning'}>
                  {period.status === 'closed' ? 'Cerrado' : 'Reabierto'}
                </span>
              </td>
              <td>
                {period.closed_by_name || 'Sin responsable'}
                <div className="muted-cell">{formatShortDateTime(period.closed_at)}</div>
              </td>
              <td>
                {period.reopened_at ? (
                  <>
                    {period.reopened_by_name || 'Sin responsable'}
                    <div className="muted-cell">{formatShortDateTime(period.reopened_at)}</div>
                  </>
                ) : (
                  'No aplica'
                )}
              </td>
              <td>{period.notes || 'Sin nota'}</td>
              <td>
                <button
                  className="secondary-button compact-action"
                  type="button"
                  onClick={() => onReopen(period)}
                  disabled={isSaving || period.status !== 'closed'}
                >
                  <RefreshCcw />
                  <span>Reabrir</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoursTable({ rows, emptyTitle }) {
  if (!rows.length) {
    return (
      <div className="empty-state compact">
        <h3>{emptyTitle}</h3>
        <p>Los resultados apareceran despues de ejecutar una consulta con filtros.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Colaborador</th>
            <th>Entrada</th>
            <th>Salida almuerzo</th>
            <th>Entrada almuerzo</th>
            <th>Salida final</th>
            <th>Trabajadas</th>
            <th>Ordinarias</th>
            <th>Extras</th>
            <th>Dobles</th>
            <th>Estado</th>
            <th>Guardado</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.userId}-${row.dateKey}`}>
              <td>{row.dateLabel}</td>
              <td>{row.employeeName}</td>
              <td>{row.entry || 'Sin marca'}</td>
              <td>{row.lunchOut || 'No aplica'}</td>
              <td>{row.lunchIn || 'No aplica'}</td>
              <td>{row.exit || 'Sin marca'}</td>
              <td>{formatHours(row.workedHours)}</td>
              <td>{formatHours(row.regularHours)}</td>
              <td>{formatHours(row.overtimeHours)}</td>
              <td>{formatHours(row.doubleHours)}</td>
              <td><span className={row.status === 'Completo' ? 'status-pill status-active' : 'status-pill status-warning'}>{row.status}</span></td>
              <td>
                <span className={row.isSaved ? 'status-pill status-active' : 'status-pill status-warning'}>
                  {row.isSaved ? `Guardado ${formatShortDateTime(row.savedCalculationAt)}` : 'Pendiente'}
                </span>
              </td>
              <td>{row.notes.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalTable({ rows, onStatusChange, onOpenDetail, isSaving }) {
  if (!rows.length) {
    return (
      <div className="empty-state compact">
        <h3>No hay horas extra sugeridas</h3>
        <p>Ejecuta una consulta con marcas que superen las reglas configuradas.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Colaborador</th>
            <th>Trabajadas</th>
            <th>Ordinarias</th>
            <th>Extra sugerida</th>
            <th>Doble sugerida</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.userId}-${row.dateKey}-approval`}>
              <td>{row.dateLabel}</td>
              <td>{row.employeeName}</td>
              <td>{formatHours(row.workedHours)}</td>
              <td>{formatHours(row.regularHours)}</td>
              <td>{formatHours(row.overtimeHours)}</td>
              <td>{formatHours(row.doubleHours)}</td>
              <td><span className={getApprovalStatusClass(row.approvalStatus)}>{getApprovalStatusLabel(row.approvalStatus)}</span></td>
              <td>
                <div className="inline-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onOpenDetail(row)}
                    disabled={isSaving}
                  >
                    Detalle
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => onStatusChange(row, 'approved')}
                    disabled={isSaving}
                  >
                    Aprobar
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onStatusChange(row, 'requires_correction')}
                    disabled={isSaving}
                  >
                    Corregir
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => onStatusChange(row, 'rejected')}
                    disabled={isSaving}
                  >
                    Rechazar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoursSummaryTable({ rows, isLoading }) {
  if (isLoading) {
    return (
      <div className="panel-loading compact">
        <Loader2 className="spin" />
        <span>Cargando resumen de horas...</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="empty-state compact">
        <h3>No hay resumen persistido para los filtros actuales</h3>
        <p>Guarda calculos de horas y luego consulta este reporte.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Dias</th>
            <th>Trabajadas</th>
            <th>Ordinarias</th>
            <th>Extras</th>
            <th>Dobles</th>
            <th>Pendientes</th>
            <th>Aprobadas</th>
            <th>Rechazadas</th>
            <th>Revision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_user_id}>
              <td>
                <strong>{row.employee_name}</strong>
                <div className="muted-cell">{row.employee_email}</div>
              </td>
              <td>{row.days_calculated}</td>
              <td>{formatHours(row.total_worked_hours)}</td>
              <td>{formatHours(row.total_regular_hours)}</td>
              <td>{formatHours(row.total_overtime_hours)}</td>
              <td>{formatHours(row.total_double_hours)}</td>
              <td>{row.pending_approvals}</td>
              <td>{row.approved_approvals}</td>
              <td>{row.rejected_approvals}</td>
              <td>{row.requires_review_days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayrollExportTable({ rows, isLoading }) {
  if (isLoading) {
    return (
      <div className="panel-loading compact">
        <Loader2 className="spin" />
        <span>Cargando reporte de planilla...</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="empty-state compact">
        <h3>No hay datos de planilla para los filtros actuales</h3>
        <p>Guarda calculos y aprueba extras antes de exportar este reporte.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Periodo</th>
            <th>Dias</th>
            <th>Ordinarias</th>
            <th>Extras aprobadas</th>
            <th>Dobles aprobadas</th>
            <th>Pendientes</th>
            <th>Rechazadas</th>
            <th>Revision</th>
            <th>Cierre</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_user_id}>
              <td>
                <strong>{row.employee_name}</strong>
                <div className="muted-cell">{row.identification || row.employee_email}</div>
                {row.job_position ? <div className="muted-cell">{row.job_position}</div> : null}
              </td>
              <td>{row.period_start} a {row.period_end}</td>
              <td>{row.days_calculated}</td>
              <td>{formatHours(row.regular_hours_to_pay)}</td>
              <td>{formatHours(row.approved_overtime_hours_to_pay)}</td>
              <td>{formatHours(row.approved_double_hours_to_pay)}</td>
              <td>
                {formatHours(Number(row.pending_overtime_hours || 0) + Number(row.pending_double_hours || 0))}
              </td>
              <td>
                {formatHours(Number(row.rejected_overtime_hours || 0) + Number(row.rejected_double_hours || 0))}
              </td>
              <td>{row.requires_review_days}</td>
              <td>
                <span className={Number(row.closed_periods || 0) > 0 ? 'status-pill status-active' : 'status-pill status-warning'}>
                  {Number(row.closed_periods || 0) > 0 ? 'Con cierre' : 'Abierto'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalAuditTable({ rows, isLoading }) {
  if (isLoading) {
    return (
      <div className="panel-loading compact">
        <Loader2 className="spin" />
        <span>Cargando bitacora de aprobaciones...</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="empty-state compact">
        <h3>No hay bitacora para los filtros actuales</h3>
        <p>Las decisiones apareceran aqui despues de ejecutar el patch 009 y aprobar, rechazar o corregir extras.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Fecha</th>
            <th>Cambio</th>
            <th>Extras</th>
            <th>Dobles</th>
            <th>Nota</th>
            <th>Responsable</th>
            <th>Registro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.employee_user_id}-${row.work_date}-${row.changed_at}-${index}`}>
              <td>
                <strong>{row.employee_name}</strong>
                <div className="muted-cell">{row.employee_email}</div>
              </td>
              <td>{row.work_date}</td>
              <td>
                <div className="status-transition">
                  <span className={getApprovalStatusClass(row.previous_status)}>
                    {getApprovalStatusLabel(row.previous_status)}
                  </span>
                  <span aria-hidden="true">a</span>
                  <span className={getApprovalStatusClass(row.new_status)}>
                    {getApprovalStatusLabel(row.new_status)}
                  </span>
                </div>
              </td>
              <td>{formatHours(row.suggested_overtime_hours)}</td>
              <td>{formatHours(row.suggested_double_hours)}</td>
              <td>{row.notes || 'Sin nota'}</td>
              <td>{row.changed_by_name || 'Sin responsable'}</td>
              <td>{formatShortDateTime(row.changed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkAuditTable({ rows, isLoading }) {
  if (isLoading) {
    return (
      <div className="panel-loading compact">
        <Loader2 className="spin" />
        <span>Cargando correcciones de marcas...</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="empty-state compact">
        <h3>No hay correcciones para los filtros actuales</h3>
        <p>Las marcas corregidas desde el modulo Marcas apareceran aqui.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Tipo</th>
            <th>Ubicacion</th>
            <th>Fecha y hora</th>
            <th>Motivo</th>
            <th>Responsable</th>
            <th>Registro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.attendance_mark_id}-${row.changed_at}-${index}`}>
              <td>
                <strong>{row.employee_name}</strong>
                <div className="muted-cell">{row.employee_email}</div>
              </td>
              <td>
                <div className="status-transition">
                  <span className={`type-pill type-${normalizeEditableMarkType(row.original_tipo)}`}>
                    {row.original_tipo}
                  </span>
                  <span aria-hidden="true">a</span>
                  <span className={`type-pill type-${normalizeEditableMarkType(row.corrected_tipo)}`}>
                    {row.corrected_tipo}
                  </span>
                </div>
              </td>
              <td>
                <strong>{row.corrected_ubicacion}</strong>
                <div className="muted-cell">Antes: {row.original_ubicacion || 'Sin ubicacion'}</div>
              </td>
              <td>
                <strong>{formatShortDateTime(row.corrected_created_at)}</strong>
                <div className="muted-cell">Antes: {formatShortDateTime(row.original_created_at)}</div>
              </td>
              <td>{row.reason || 'Sin motivo'}</td>
              <td>{row.changed_by_name || 'Sin responsable'}</td>
              <td>{formatShortDateTime(row.changed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function normalizeRecords(rows) {
  return rows
    .map((row) => {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      return {
        ...row,
        employee_name: row.employee_name || row.display_name || row.employee_email || 'Sin nombre',
        employee_email: row.employee_email || '',
        created_at: row.created_at,
        createdAt,
        dateKey: row.attendance_date || formatDateKey(createdAt),
        dateLabel: createdAt ? DATE_FORMATTER.format(createdAt) : row.attendance_date,
        timeLabel: row.attendance_time || (createdAt ? createdAt.toLocaleTimeString('es-CR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: CR_TIMEZONE,
        }) : ''),
      };
    })
    .sort((a, b) => {
      const employeeCompare = a.employee_name.localeCompare(b.employee_name, 'es');
      if (employeeCompare !== 0) return employeeCompare;

      const dateCompare = (a.dateKey || '').localeCompare(b.dateKey || '');
      if (dateCompare !== 0) return dateCompare;

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

function formatSupervisorValidation(status) {
  const labels = {
    no_required: 'No requiere autorizacion',
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    rejected: 'Rechazada',
    duplicated: 'Duplicada',
  };

  return labels[status] || 'No requiere autorizacion';
}

function formatHrValidation(status) {
  const labels = {
    pending: 'Pendiente RRHH',
    confirmed: 'Confirmada RRHH',
    rejected: 'Rechazada RRHH',
    duplicated: 'Duplicada RRHH',
  };

  return labels[status] || 'Pendiente RRHH';
}

function normalizeBackendCalculationRows(rows) {
  return rows.flatMap((row) => {
    const baseDate = row.work_date;
    const base = {
      user_id: row.employee_user_id,
      employee_name: row.employee_name || row.employee_email || 'Sin nombre',
      employee_email: row.employee_email || '',
      ubicacion: 'Calculo backend',
      descripcion: 'Generado desde Supabase',
      latitud: null,
      longitud: null,
      ip: '',
      dateKey: baseDate,
      dateLabel: baseDate,
      backendCalculation: {
        workedHours: Number(row.worked_hours || 0),
        regularHours: Number(row.regular_hours || 0),
        overtimeHours: Number(row.overtime_hours || 0),
        doubleHours: Number(row.double_hours || 0),
        status: row.calculation_status === 'complete' ? 'Completo' : 'Requiere revision',
        notes: Array.isArray(row.observations) && row.observations.length ? row.observations : ['Dia completo'],
        rawMarkIds: row.raw_mark_ids || [],
      },
    };
    const marks = [];

    if (row.entry_time) {
      marks.push(buildSyntheticRecord(base, row, 'entrada', row.entry_time));
    }
    if (row.lunch_out_time) {
      marks.push(buildSyntheticRecord(base, row, 'salida_almuerzo', row.lunch_out_time));
    }
    if (row.lunch_in_time) {
      marks.push(buildSyntheticRecord(base, row, 'entrada_almuerzo', row.lunch_in_time));
    }
    if (row.exit_time) {
      marks.push(buildSyntheticRecord(base, row, 'salida', row.exit_time));
    }

    return marks;
  });
}

function buildSyntheticRecord(base, row, tipo, timeLabel) {
  const createdAt = new Date(`${row.work_date}T${timeLabel || '00:00:00'}-06:00`);
  return {
    ...base,
    id: `backend-${row.employee_user_id}-${row.work_date}-${tipo}`,
    tipo,
    created_at: createdAt.toISOString(),
    createdAt,
    timeLabel,
  };
}

function calculateHourRows(
  rows,
  settings = DEFAULT_ATTENDANCE_SETTINGS,
  approvalMap = new Map(),
  savedCalculationMap = new Map()
) {
  const regularDailyHours = Number(settings.daily_regular_hours) || DEFAULT_ATTENDANCE_SETTINGS.daily_regular_hours;
  const maxOvertimeBeforeDouble =
    Number(settings.daily_overtime_before_double) || DEFAULT_ATTENDANCE_SETTINGS.daily_overtime_before_double;
  const lunchHours = (Number(settings.lunch_minutes) || 0) / 60;
  const requireLunchMarks = Boolean(settings.requires_lunch_out || settings.requires_lunch_in);
  const shouldAutoDeductLunch = Boolean(settings.auto_deduct_lunch);
  const grouped = new Map();

  rows.forEach((record) => {
    const key = `${record.user_id}-${record.dateKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        userId: record.user_id,
        employeeName: record.employee_name,
        employeeEmail: record.employee_email,
        dateKey: record.dateKey,
        dateLabel: record.dateLabel,
        records: [],
        backendCalculation: record.backendCalculation || null,
      });
    }
    const group = grouped.get(key);
    if (!group.backendCalculation && record.backendCalculation) {
      group.backendCalculation = record.backendCalculation;
    }
    group.records.push(record);
  });

  return Array.from(grouped.values())
    .map((group) => {
      const sorted = [...group.records].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const entry = findFirstMark(sorted, ['entrada']);
      const lunchOut = findFirstMark(sorted, ['salida_almuerzo', 'almuerzo_salida']);
      const lunchIn = findFirstMark(sorted, ['entrada_almuerzo', 'almuerzo_entrada']);
      const exits = sorted.filter((record) => ['salida', 'salida_final'].includes(record.tipo));
      const exit = exits.at(-1);
      const notes = [];
      let workedHours = 0;

      if (!entry) notes.push('Falta entrada');
      if (!exit) notes.push('Falta salida');
      if (requireLunchMarks && (!lunchOut || !lunchIn)) notes.push('Almuerzo no marcado');

      if (entry?.createdAt && exit?.createdAt) {
        workedHours = Math.max(0, (exit.createdAt.getTime() - entry.createdAt.getTime()) / 3600000);
        if (lunchOut?.createdAt && lunchIn?.createdAt) {
          workedHours -= Math.max(0, (lunchIn.createdAt.getTime() - lunchOut.createdAt.getTime()) / 3600000);
        } else if (!requireLunchMarks && shouldAutoDeductLunch && lunchHours > 0) {
          workedHours = Math.max(0, workedHours - lunchHours);
          notes.push('Almuerzo descontado automaticamente');
        }
      }

      let regularHours = Math.min(workedHours, regularDailyHours);
      let overtimeCandidate = Math.max(0, workedHours - regularDailyHours);
      let overtimeHours = Math.min(overtimeCandidate, maxOvertimeBeforeDouble);
      let doubleHours = Math.max(0, overtimeCandidate - maxOvertimeBeforeDouble);
      let status = notes.some((note) => note.startsWith('Falta')) ? 'Requiere revision' : 'Completo';

      if (group.backendCalculation) {
        workedHours = group.backendCalculation.workedHours;
        regularHours = group.backendCalculation.regularHours;
        overtimeHours = group.backendCalculation.overtimeHours;
        doubleHours = group.backendCalculation.doubleHours;
        status = group.backendCalculation.status;
        notes.splice(0, notes.length, ...group.backendCalculation.notes);
      }
      const approval = approvalMap.get(`${group.userId}-${group.dateKey}`);
      const savedCalculation = savedCalculationMap.get(`${group.userId}-${group.dateKey}`);

      if (!group.backendCalculation && overtimeHours > 0) notes.push('Horas extra pendientes de aprobacion');
      if (!group.backendCalculation && doubleHours > 0) notes.push('Horas dobles sugeridas');
      if (!notes.length) notes.push('Dia completo');

      return {
        ...group,
        entry: entry?.timeLabel,
        lunchOut: lunchOut?.timeLabel,
        lunchIn: lunchIn?.timeLabel,
        exit: exit?.timeLabel,
        entryTime: entry?.timeLabel,
        lunchOutTime: lunchOut?.timeLabel,
        lunchInTime: lunchIn?.timeLabel,
        exitTime: exit?.timeLabel,
        workedHours,
        regularHours,
        overtimeHours,
        doubleHours,
        status,
        approvalStatus: approval?.status || (overtimeHours > 0 || doubleHours > 0 ? 'pending_review' : 'not_required'),
        approvalNotes: approval?.notes || '',
        savedCalculationStatus: savedCalculation?.calculation_status || '',
        savedCalculationAt: savedCalculation?.calculated_at || savedCalculation?.updated_at || '',
        isSaved: Boolean(savedCalculation),
        rawMarkIds: group.backendCalculation?.rawMarkIds?.length
          ? group.backendCalculation.rawMarkIds
          : sorted.map((record) => String(record.id)).filter(Boolean),
        notes,
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.employeeName.localeCompare(b.employeeName, 'es'));
}

function findFirstMark(records, types) {
  return records.find((record) => types.includes(record.tipo));
}

function normalizeAttendanceSettings(row) {
  return {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    company_name: row.company_name || DEFAULT_ATTENDANCE_SETTINGS.company_name,
    calculation_mode: row.calculation_mode || DEFAULT_ATTENDANCE_SETTINGS.calculation_mode,
    period_type: row.period_type || DEFAULT_ATTENDANCE_SETTINGS.period_type,
    start_time: formatTimeInput(row.start_time) || DEFAULT_ATTENDANCE_SETTINGS.start_time,
    end_time: formatTimeInput(row.end_time) || DEFAULT_ATTENDANCE_SETTINGS.end_time,
    lunch_minutes: row.lunch_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.lunch_minutes,
    requires_lunch_out: Boolean(row.requires_lunch_out),
    requires_lunch_in: Boolean(row.requires_lunch_in),
    auto_deduct_lunch: row.auto_deduct_lunch !== false,
    late_tolerance_minutes: row.late_tolerance_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.late_tolerance_minutes,
    overtime_minimum_minutes: row.overtime_minimum_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.overtime_minimum_minutes,
    rounding_rule: row.rounding_rule || DEFAULT_ATTENDANCE_SETTINGS.rounding_rule,
    daily_regular_hours: row.daily_regular_hours ?? DEFAULT_ATTENDANCE_SETTINGS.daily_regular_hours,
    weekly_regular_hours: row.weekly_regular_hours ?? DEFAULT_ATTENDANCE_SETTINGS.weekly_regular_hours,
    biweekly_regular_hours: row.biweekly_regular_hours ?? DEFAULT_ATTENDANCE_SETTINGS.biweekly_regular_hours,
    daily_overtime_before_double:
      row.daily_overtime_before_double ?? DEFAULT_ATTENDANCE_SETTINGS.daily_overtime_before_double,
    sunday_rule: row.sunday_rule || DEFAULT_ATTENDANCE_SETTINGS.sunday_rule,
    holiday_rule: row.holiday_rule || DEFAULT_ATTENDANCE_SETTINGS.holiday_rule,
    requires_overtime_approval: row.requires_overtime_approval !== false,
    requires_second_approval: Boolean(row.requires_second_approval),
  };
}

function formatTimeInput(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)} h`;
}

function formatShortDateTime(value) {
  if (!value) return '';
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function normalizeEditableMarkType(value) {
  if (value === 'almuerzo_salida') return 'salida_almuerzo';
  if (value === 'almuerzo_entrada') return 'entrada_almuerzo';
  if (value === 'salida_final') return 'salida';
  return value || 'entrada';
}

function buildCostaRicaTimestamp(date, time) {
  const safeTime = String(time || '00:00').slice(0, 5);
  return `${date}T${safeTime}:00-06:00`;
}

function getApprovalStatusLabel(status) {
  const labels = {
    undefined: 'Sin estado previo',
    not_required: 'No requiere',
    pending_review: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    approved_for_payroll: 'Aprobada para pago',
    requires_correction: 'Requiere correccion',
    paid: 'Pagada',
  };
  if (!status) return 'Sin estado previo';
  return labels[status] || 'Pendiente';
}

function getApprovalStatusClass(status) {
  if (status === 'approved' || status === 'approved_for_payroll' || status === 'paid') {
    return 'status-pill status-active';
  }

  if (status === 'rejected') {
    return 'status-pill status-inactive';
  }

  return 'status-pill status-warning';
}

function getViewTitle(view) {
  const titles = {
    dashboard: 'Dashboard administrativo',
    marcas: 'Consulta de marcas',
    horas: 'Calculo de horas',
    aprobacion: 'Aprobacion de horas extra',
    empleados: 'Colaboradores y usuarios',
    configuracion: 'Configuracion general',
    reportes: 'Reportes',
  };
  return titles[view] || 'Administracion';
}

function getViewDescription(view) {
  const descriptions = {
    dashboard: 'Resumen inicial sin precargar datos masivos.',
    marcas: 'Consulta y auditoria de registros crudos de asistencia.',
    horas: 'Interpretacion inicial de marcas para horas ordinarias, extra y dobles.',
    aprobacion: 'Revision administrativa de extras sugeridas antes de enviarlas a pago.',
    empleados: 'Gestion basica de usuarios creados desde administracion.',
    configuracion: 'Parametros operativos y reglas preparadas para crecer por empresa.',
    reportes: 'Salidas limpias para marcas, horas e inconsistencias.',
  };
  return descriptions[view] || '';
}

function normalizeAttendanceLocations(locations) {
  const cleanedLocations = locations
    .filter((location) => location?.name && location.name !== OTHER_LOCATION.name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'es'));

  return [...cleanedLocations, OTHER_LOCATION];
}

function getSingleSelectedEmployeeFilter(selectedEmployees) {
  return selectedEmployees.length === 1 ? selectedEmployees[0] : null;
}

function matchesSelectedEmployee(userId, selectedEmployees) {
  return !selectedEmployees.length || selectedEmployees.includes(userId);
}

function filterRowsBySelectedEmployees(rows, selectedEmployees, key = 'employee_user_id') {
  if (!selectedEmployees.length) return rows;
  return rows.filter((row) => selectedEmployees.includes(row[key] || row.user_id));
}

function getVisibleEmployees(rows, includeInactive = false) {
  return includeInactive ? rows : rows.filter((employee) => employee.is_active !== false);
}

function groupRecords(rows) {
  const grouped = new Map();

  rows.forEach((record) => {
    if (!grouped.has(record.user_id)) {
      grouped.set(record.user_id, {
        userId: record.user_id,
        employeeName: record.employee_name,
        employeeEmail: record.employee_email,
        total: 0,
        dates: [],
      });
    }

    const employeeGroup = grouped.get(record.user_id);
    employeeGroup.total += 1;

    let dateGroup = employeeGroup.dates.find((entry) => entry.dateKey === record.dateKey);

    if (!dateGroup) {
      dateGroup = {
        dateKey: record.dateKey,
        dateLabel: record.dateLabel,
        records: [],
      };
      employeeGroup.dates.push(dateGroup);
    }

    dateGroup.records.push(record);
  });

  return Array.from(grouped.values());
}

function buildExportRows(rows) {
  return rows.map((record) => ({
    Empleado: record.employee_name,
    Correo: record.employee_email,
    Fecha: record.dateLabel,
    Hora: record.timeLabel,
    Tipo: record.tipo,
    Ubicacion: record.ubicacion,
    Descripcion: record.descripcion || '',
    Latitud: record.latitud || '',
    Longitud: record.longitud || '',
    'Google Maps': record.latitud && record.longitud
      ? `https://www.google.com/maps?q=${record.latitud},${record.longitud}`
      : '',
    IP: record.ip || '',
  }));
}

function buildFilename(extension) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `reporte-asistencias-${stamp}.${extension}`;
}

function formatDateKey(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

function getDefaultEndDate() {
  return new Date().toISOString().slice(0, 10);
}

function isAdminSession(session) {
  return Boolean(
    session?.user?.user_metadata?.is_admin === true ||
    session?.user?.user_metadata?.role === 'admin' ||
    session?.user?.app_metadata?.role === 'admin'
  );
}

function extractFirstName(displayName = '') {
  return displayName.trim().split(' ')[0] || '';
}

function extractLastName(displayName = '') {
  const parts = displayName.trim().split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
}
