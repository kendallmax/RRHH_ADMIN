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

## Funcion edge requerida

Despliega la funcion de Supabase ubicada en:

`/supabase/functions/manage-employees/index.ts`
