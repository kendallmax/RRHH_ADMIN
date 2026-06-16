# RRHH_ADMIN

Portal de RRHH con reportes y administracion de empleados.

## Variables de entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_APP_URL=https://rrhh.conectecr.com
```

## SQL requerido

Ejecuta `supabase/attendance_report.sql` en Supabase.

Para activar la base escalable de RRHH, reglas configurables, calculos y aprobaciones, ejecuta tambien:

`supabase/hr_platform_foundation.sql`

Si ya habias ejecutado la base antes de agregar persistencia de calculos, ejecuta el patch incremental:

`supabase/hr_platform_patch_002_calculations.sql`

Para conectar el directorio con `profiles` y `employees`, ejecuta:

`supabase/hr_platform_patch_003_employee_records.sql`

Si aprobar o rechazar extras muestra ambiguedad de columnas, ejecuta:

`supabase/hr_platform_patch_004_approval_ambiguity.sql`

Para mostrar calculos de horas ya guardados en el admin, ejecuta:

`supabase/hr_platform_patch_005_saved_calculations.sql`

Para reportes resumidos desde calculos persistidos, ejecuta:

`supabase/hr_platform_patch_006_persisted_reports.sql`

Si el reporte indica que la funcion no esta en el schema cache, ejecuta:

`supabase/hr_platform_patch_007_reports_schema_reload.sql`

Para calcular horas directamente desde Supabase y opcionalmente persistirlas, ejecuta:

`supabase/hr_platform_patch_008_backend_hour_calculation.sql`

Para registrar y consultar la bitacora de aprobaciones de horas extra, ejecuta:

`supabase/hr_platform_patch_009_approval_audit.sql`

Para corregir marcas desde RRHH con bitacora administrativa, ejecuta:

`supabase/hr_platform_patch_010_attendance_corrections.sql`

Si al corregir una marca aparece `value too long for type character varying(10)`, ejecuta:

`supabase/hr_platform_patch_011_attendance_type_length.sql`

Si al corregir una marca aparece una violacion de `asistencias_tipo_check`, ejecuta:

`supabase/hr_platform_patch_012_attendance_type_check.sql`

Para cerrar periodos de planilla y bloquear cambios en rangos revisados, ejecuta:

`supabase/hr_platform_patch_013_payroll_period_closure.sql`

Para generar el reporte exportable listo para planilla, ejecuta:

`supabase/hr_platform_patch_014_payroll_export_report.sql`

## Funcion edge requerida

Despliega la funcion de Supabase ubicada en:

`/supabase/functions/manage-employees/index.ts`

Despues de aplicar el patch 003, vuelve a desplegar esa funcion para que cree y actualice expedientes basicos.
