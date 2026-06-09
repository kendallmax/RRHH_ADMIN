import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  LogOut,
  MapPinned,
  PencilLine,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  UserPlus,
  Users,
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
  isAdmin: false,
  isActive: true,
};

const EMPTY_LOCATION_FORM = {
  id: '',
  name: '',
  requiresDescription: false,
  sortOrder: 0,
  isActive: true,
};

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

export default function HRDashboard({ session }) {
  const [activeView, setActiveView] = useState('reportes');
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEmployeeSaving, setIsEmployeeSaving] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeFeedback, setEmployeeFeedback] = useState('');
  const [employeeError, setEmployeeError] = useState('');
  const [locations, setLocations] = useState([]);
  const [isLocationSaving, setIsLocationSaving] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState('');
  const [locationError, setLocationError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentUserName =
    session?.user?.user_metadata?.display_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email;

  const isAdmin = isAdminSession(session);

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
      const [employeesResult, recordsResult] = await Promise.all([
        supabase.rpc('get_employee_directory'),
        supabase.rpc('get_attendance_report', {
          filter_user_id: null,
          filter_start_date: startDate,
          filter_end_date: endDate,
        }),
      ]);

      if (employeesResult.error) throw employeesResult.error;
      if (recordsResult.error) throw recordsResult.error;

      setEmployees(employeesResult.data || []);
      setRecords(normalizeRecords(recordsResult.data || []));
      await refreshLocations({ silentFallback: false });
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible cargar el panel de RRHH.');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDirectory = async () => {
    const { data, error } = await supabase.rpc('get_employee_directory');
    if (error) throw error;
    setEmployees(data || []);
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

  const refreshReport = async () => {
    setIsRefreshing(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.rpc('get_attendance_report', {
        filter_user_id: selectedEmployee || null,
        filter_start_date: startDate || null,
        filter_end_date: endDate || null,
      });

      if (error) throw error;

      setRecords(normalizeRecords(data || []));
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible actualizar el reporte.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return records.filter((record) => {
      const matchesEmployee = !selectedEmployee || record.user_id === selectedEmployee;
      const matchesSearch =
        !query ||
        record.employee_name.toLowerCase().includes(query) ||
        record.employee_email.toLowerCase().includes(query) ||
        record.ubicacion.toLowerCase().includes(query) ||
        (record.descripcion || '').toLowerCase().includes(query);

      return matchesEmployee && matchesSearch;
    });
  }, [records, searchText, selectedEmployee]);

  const groupedRecords = useMemo(() => groupRecords(filteredRecords), [filteredRecords]);
  const exportRows = useMemo(() => buildExportRows(filteredRecords), [filteredRecords]);

  const stats = useMemo(() => {
    const uniqueEmployees = new Set(filteredRecords.map((record) => record.user_id));
    return {
      totalRecords: filteredRecords.length,
      totalEmployees: uniqueEmployees.size,
      totalEntries: filteredRecords.filter((record) => record.tipo === 'entrada').length,
      totalExits: filteredRecords.filter((record) => record.tipo === 'salida').length,
    };
  }, [filteredRecords]);

  const handleExportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Asistencias');
    XLSX.writeFile(workbook, buildFilename('xlsx'));
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
      isAdmin: Boolean(employee.is_admin),
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
        isAdmin: employeeForm.isAdmin,
        isActive: employeeForm.isActive,
      };

      await callManageEmployees(payload);
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
      `Se eliminara la cuenta de ${employee.display_name}. Esta accion no se puede deshacer.`
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
      setEmployeeFeedback('Empleado eliminado correctamente.');
    } catch (error) {
      setEmployeeError(error.message || 'No fue posible eliminar el empleado.');
    } finally {
      setIsEmployeeSaving(false);
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

  const callManageEmployees = async (payload) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();

    if (!currentSession?.access_token) {
      throw new Error('La sesion no es valida. Inicia sesion nuevamente.');
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'No fue posible completar la accion.');
    }

    return result;
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
    <div className="dashboard-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Conecte RRHH</div>
          <h1>Panel de registros de asistencia</h1>
          <p>Filtra, audita y exporta los movimientos registrados por el personal.</p>
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

      <nav className="view-tabs">
        <button
          className={activeView === 'reportes' ? 'view-tab active' : 'view-tab'}
          onClick={() => setActiveView('reportes')}
        >
          <FileText />
          <span>Reportes</span>
        </button>
        <button
          className={activeView === 'empleados' ? 'view-tab active' : 'view-tab'}
          onClick={() => setActiveView('empleados')}
        >
          <UserCog />
          <span>Empleados</span>
        </button>
        <button
          className={activeView === 'configuracion' ? 'view-tab active' : 'view-tab'}
          onClick={() => setActiveView('configuracion')}
        >
          <SlidersHorizontal />
          <span>Configuracion</span>
        </button>
      </nav>

      {activeView === 'reportes' ? (
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
              <label>
                Empleado
                <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                  <option value="">Todos los empleados</option>
                  {employees.map((employee) => (
                    <option key={employee.user_id} value={employee.user_id}>
                      {employee.display_name} {employee.email ? `- ${employee.email}` : ''}
                    </option>
                  ))}
                </select>
              </label>

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
      ) : activeView === 'empleados' ? (
        <>
          <section className="filter-panel">
            <div className="filter-panel-header">
              <div>
                <h2>Administracion de empleados</h2>
                <p>Crea, edita o elimina cuentas y define quienes son administradores de RRHH.</p>
              </div>
              <div className="toolbar">
                <button className="secondary-button" onClick={refreshDirectory}>
                  <RefreshCcw />
                  <span>Recargar lista</span>
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
            {employees.map((employee) => (
              <article key={employee.user_id} className="employee-admin-card">
                <div className="employee-admin-main">
                  <div>
                    <h3>{employee.display_name}</h3>
                    <p>{employee.email}</p>
                  </div>
                  <div className="employee-admin-badges">
                    <span className={employee.is_admin ? 'status-pill status-admin' : 'status-pill'}>
                      {employee.is_admin ? 'Admin RRHH' : 'Empleado'}
                    </span>
                    <span className={employee.is_active ? 'status-pill status-active' : 'status-pill status-inactive'}>
                      {employee.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
                <div className="employee-admin-meta">
                  <span>Creado: {employee.created_at ? DATE_TIME_FORMATTER.format(new Date(employee.created_at)) : 'Sin fecha'}</span>
                </div>
                <div className="employee-admin-actions">
                  <button className="secondary-button" onClick={() => openEditEmployeeModal(employee)}>
                    <PencilLine />
                    <span>Editar</span>
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => handleEmployeeDelete(employee)}
                    disabled={isEmployeeSaving || employee.user_id === session.user.id}
                  >
                    <Trash2 />
                    <span>Eliminar</span>
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="filter-panel">
            <div className="filter-panel-header">
              <div>
                <h2>Configuraciones operativas</h2>
                <p>Administra los lugares disponibles para marcar y deja base para futuros ajustes.</p>
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
      )}

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

function normalizeAttendanceLocations(locations) {
  const cleanedLocations = locations
    .filter((location) => location?.name && location.name !== OTHER_LOCATION.name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'es'));

  return [...cleanedLocations, OTHER_LOCATION];
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
