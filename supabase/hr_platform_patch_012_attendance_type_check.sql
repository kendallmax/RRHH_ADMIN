-- Patch 012: allow all attendance mark types used by lunch and correction flows.

alter table public.asistencias
drop constraint if exists asistencias_tipo_check;

alter table public.asistencias
add constraint asistencias_tipo_check
check (
  tipo in (
    'entrada',
    'salida',
    'salida_almuerzo',
    'entrada_almuerzo',
    'almuerzo_salida',
    'almuerzo_entrada',
    'salida_final'
  )
);

select pg_notify('pgrst', 'reload schema');
