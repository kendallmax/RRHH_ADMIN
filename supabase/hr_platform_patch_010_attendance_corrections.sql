-- Patch 010: administrative attendance mark corrections with audit trail.

alter table public.asistencias
alter column tipo type text
using tipo::text;

create or replace function public.admin_correct_attendance_mark(
  attendance_mark_id text,
  corrected_tipo text,
  corrected_ubicacion text,
  corrected_descripcion text,
  corrected_created_at timestamptz,
  correction_reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  original_record public.asistencias%rowtype;
  corrected_record public.asistencias%rowtype;
begin
  perform public.assert_hr_admin();

  if nullif(btrim(attendance_mark_id), '') is null then
    raise exception 'Debe indicar la marca a corregir.';
  end if;

  if corrected_tipo not in ('entrada', 'salida', 'salida_almuerzo', 'entrada_almuerzo', 'almuerzo_salida', 'almuerzo_entrada', 'salida_final') then
    raise exception 'Tipo de marca no valido.';
  end if;

  if nullif(btrim(corrected_ubicacion), '') is null then
    raise exception 'Debe indicar la ubicacion corregida.';
  end if;

  if corrected_created_at is null then
    raise exception 'Debe indicar fecha y hora corregidas.';
  end if;

  if nullif(btrim(correction_reason), '') is null then
    raise exception 'Debe indicar el motivo de la correccion.';
  end if;

  select *
  into original_record
  from public.asistencias a
  where a.id::text = attendance_mark_id
  for update;

  if not found then
    raise exception 'No se encontro la marca indicada.';
  end if;

  update public.asistencias
  set
    tipo = corrected_tipo,
    ubicacion = btrim(corrected_ubicacion),
    descripcion = nullif(btrim(coalesce(corrected_descripcion, '')), ''),
    created_at = corrected_created_at
  where id::text = attendance_mark_id
  returning *
  into corrected_record;

  insert into public.attendance_mark_audit (
    attendance_mark_id,
    original_payload,
    corrected_payload,
    action,
    reason,
    changed_by
  )
  values (
    attendance_mark_id,
    to_jsonb(original_record),
    to_jsonb(corrected_record),
    'correction',
    btrim(correction_reason),
    auth.uid()
  );
end;
$$;

grant execute on function public.admin_correct_attendance_mark(text, text, text, text, timestamptz, text) to authenticated;

create or replace function public.admin_list_attendance_mark_audit(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  attendance_mark_id text,
  employee_user_id uuid,
  employee_name text,
  employee_email text,
  action text,
  reason text,
  original_tipo text,
  corrected_tipo text,
  original_ubicacion text,
  corrected_ubicacion text,
  original_created_at timestamptz,
  corrected_created_at timestamptz,
  changed_by_name text,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    audit.attendance_mark_id,
    (audit.corrected_payload ->> 'user_id')::uuid as employee_user_id,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email::text, '@', 1)
    ) as employee_name,
    u.email::text as employee_email,
    audit.action,
    audit.reason,
    audit.original_payload ->> 'tipo' as original_tipo,
    audit.corrected_payload ->> 'tipo' as corrected_tipo,
    audit.original_payload ->> 'ubicacion' as original_ubicacion,
    audit.corrected_payload ->> 'ubicacion' as corrected_ubicacion,
    (audit.original_payload ->> 'created_at')::timestamptz as original_created_at,
    (audit.corrected_payload ->> 'created_at')::timestamptz as corrected_created_at,
    coalesce(
      nullif(changer.raw_user_meta_data ->> 'display_name', ''),
      nullif(changer.raw_user_meta_data ->> 'full_name', ''),
      split_part(changer.email::text, '@', 1)
    ) as changed_by_name,
    audit.changed_at
  from public.attendance_mark_audit audit
  join auth.users u on u.id = (audit.corrected_payload ->> 'user_id')::uuid
  left join auth.users changer on changer.id = audit.changed_by
  left join public.profiles p on p.auth_user_id = (audit.corrected_payload ->> 'user_id')::uuid
  left join public.employees e on e.auth_user_id = (audit.corrected_payload ->> 'user_id')::uuid
  where audit.action = 'correction'
    and (filter_user_id is null or (audit.corrected_payload ->> 'user_id')::uuid = filter_user_id)
    and (
      filter_start_date is null
      or timezone('America/Costa_Rica', (audit.corrected_payload ->> 'created_at')::timestamptz)::date >= filter_start_date
    )
    and (
      filter_end_date is null
      or timezone('America/Costa_Rica', (audit.corrected_payload ->> 'created_at')::timestamptz)::date <= filter_end_date
    )
  order by audit.changed_at desc;
end;
$$;

grant execute on function public.admin_list_attendance_mark_audit(uuid, date, date) to authenticated;

select pg_notify('pgrst', 'reload schema');
