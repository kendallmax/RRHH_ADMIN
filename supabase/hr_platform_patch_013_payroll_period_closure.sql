-- Patch 013: payroll period closure and write protection for reviewed ranges.

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'closed' check (status in ('closed', 'reopened')),
  notes text,
  closed_by uuid references auth.users(id),
  closed_at timestamptz not null default now(),
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (company_id, start_date, end_date)
);

alter table public.payroll_periods enable row level security;

drop policy if exists hr_admin_manage_payroll_periods on public.payroll_periods;
create policy hr_admin_manage_payroll_periods on public.payroll_periods
for all
to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop trigger if exists payroll_periods_set_updated_at on public.payroll_periods;
create trigger payroll_periods_set_updated_at
before update on public.payroll_periods
for each row
execute function public.touch_updated_at();

create or replace function public.assert_payroll_period_open(target_work_date date)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  closed_period text;
begin
  if target_work_date is null then
    return;
  end if;

  select pp.period_name
  into closed_period
  from public.payroll_periods pp
  where pp.company_id = public.get_default_company_id()
    and pp.status = 'closed'
    and target_work_date between pp.start_date and pp.end_date
  order by pp.closed_at desc
  limit 1;

  if closed_period is not null then
    raise exception 'El periodo de planilla "%" esta cerrado para la fecha %.', closed_period, target_work_date;
  end if;
end;
$$;

grant execute on function public.assert_payroll_period_open(date) to authenticated;

create or replace function public.block_closed_payroll_attendance_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_payroll_period_open(timezone('America/Costa_Rica', old.created_at)::date);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_payroll_period_open(timezone('America/Costa_Rica', new.created_at)::date);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists asistencias_block_closed_payroll_changes on public.asistencias;
create trigger asistencias_block_closed_payroll_changes
before update or delete on public.asistencias
for each row
execute function public.block_closed_payroll_attendance_changes();

create or replace function public.block_closed_payroll_hour_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_payroll_period_open(old.work_date);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_payroll_period_open(new.work_date);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists hour_calculations_block_closed_payroll_changes on public.hour_calculations;
create trigger hour_calculations_block_closed_payroll_changes
before insert or update or delete on public.hour_calculations
for each row
execute function public.block_closed_payroll_hour_changes();

drop trigger if exists overtime_approvals_block_closed_payroll_changes on public.overtime_approvals;
create trigger overtime_approvals_block_closed_payroll_changes
before insert or update or delete on public.overtime_approvals
for each row
execute function public.block_closed_payroll_hour_changes();

create or replace function public.admin_list_payroll_periods()
returns table (
  id uuid,
  period_name text,
  start_date date,
  end_date date,
  status text,
  notes text,
  closed_by_name text,
  closed_at timestamptz,
  reopened_by_name text,
  reopened_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    pp.id,
    pp.period_name,
    pp.start_date,
    pp.end_date,
    pp.status,
    pp.notes,
    coalesce(
      nullif(closer.raw_user_meta_data ->> 'display_name', ''),
      nullif(closer.raw_user_meta_data ->> 'full_name', ''),
      split_part(closer.email::text, '@', 1)
    ) as closed_by_name,
    pp.closed_at,
    coalesce(
      nullif(reopener.raw_user_meta_data ->> 'display_name', ''),
      nullif(reopener.raw_user_meta_data ->> 'full_name', ''),
      split_part(reopener.email::text, '@', 1)
    ) as reopened_by_name,
    pp.reopened_at
  from public.payroll_periods pp
  left join auth.users closer on closer.id = pp.closed_by
  left join auth.users reopener on reopener.id = pp.reopened_by
  where pp.company_id = public.get_default_company_id()
  order by pp.start_date desc, pp.created_at desc;
end;
$$;

grant execute on function public.admin_list_payroll_periods() to authenticated;

create or replace function public.admin_close_payroll_period(
  period_name text,
  period_start_date date,
  period_end_date date,
  period_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid := public.get_default_company_id();
  saved_period_id uuid;
begin
  perform public.assert_hr_admin();

  if target_company_id is null then
    raise exception 'No existe una empresa configurada.';
  end if;

  if nullif(btrim(period_name), '') is null then
    raise exception 'Debe indicar el nombre del periodo.';
  end if;

  if period_start_date is null or period_end_date is null or period_end_date < period_start_date then
    raise exception 'El rango del periodo no es valido.';
  end if;

  insert into public.payroll_periods (
    company_id,
    period_name,
    start_date,
    end_date,
    status,
    notes,
    closed_by,
    closed_at,
    reopened_by,
    reopened_at
  )
  values (
    target_company_id,
    btrim(period_name),
    period_start_date,
    period_end_date,
    'closed',
    nullif(btrim(coalesce(period_notes, '')), ''),
    auth.uid(),
    now(),
    null,
    null
  )
  on conflict (company_id, start_date, end_date) do update
  set
    period_name = excluded.period_name,
    status = 'closed',
    notes = excluded.notes,
    closed_by = auth.uid(),
    closed_at = now(),
    reopened_by = null,
    reopened_at = null,
    updated_at = now()
  returning id into saved_period_id;

  return saved_period_id;
end;
$$;

grant execute on function public.admin_close_payroll_period(text, date, date, text) to authenticated;

create or replace function public.admin_reopen_payroll_period(period_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  update public.payroll_periods pp
  set
    status = 'reopened',
    reopened_by = auth.uid(),
    reopened_at = now(),
    updated_at = now()
  where pp.id = period_id
    and pp.company_id = public.get_default_company_id();

  if not found then
    raise exception 'No se encontro el periodo indicado.';
  end if;
end;
$$;

grant execute on function public.admin_reopen_payroll_period(uuid) to authenticated;

drop function if exists public.admin_set_overtime_approval(uuid, date, numeric, numeric, text, text);

create function public.admin_set_overtime_approval(
  employee_user_id uuid,
  work_date date,
  suggested_overtime_hours numeric,
  suggested_double_hours numeric,
  approval_status text,
  approval_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid := public.get_default_company_id();
  previous_status text;
begin
  perform public.assert_hr_admin();
  perform public.assert_payroll_period_open(admin_set_overtime_approval.work_date);

  if approval_status not in ('pending_review', 'approved', 'rejected', 'approved_for_payroll', 'requires_correction', 'paid') then
    raise exception 'Estado de aprobacion no valido.';
  end if;

  if target_company_id is null then
    raise exception 'No existe una empresa configurada.';
  end if;

  select oa.status
  into previous_status
  from public.overtime_approvals oa
  where oa.company_id = target_company_id
    and oa.employee_user_id = admin_set_overtime_approval.employee_user_id
    and oa.work_date = admin_set_overtime_approval.work_date;

  insert into public.overtime_approvals (
    company_id,
    employee_user_id,
    work_date,
    suggested_overtime_hours,
    suggested_double_hours,
    status,
    notes,
    first_approved_by,
    first_approved_at
  )
  values (
    target_company_id,
    admin_set_overtime_approval.employee_user_id,
    admin_set_overtime_approval.work_date,
    greatest(coalesce(suggested_overtime_hours, 0), 0),
    greatest(coalesce(suggested_double_hours, 0), 0),
    approval_status,
    approval_notes,
    case when approval_status in ('approved', 'approved_for_payroll') then auth.uid() else null end,
    case when approval_status in ('approved', 'approved_for_payroll') then now() else null end
  )
  on conflict on constraint overtime_approvals_company_id_employee_user_id_work_date_key do update
  set
    suggested_overtime_hours = excluded.suggested_overtime_hours,
    suggested_double_hours = excluded.suggested_double_hours,
    status = excluded.status,
    notes = excluded.notes,
    first_approved_by = case
      when excluded.status in ('approved', 'approved_for_payroll') then auth.uid()
      else public.overtime_approvals.first_approved_by
    end,
    first_approved_at = case
      when excluded.status in ('approved', 'approved_for_payroll') then now()
      else public.overtime_approvals.first_approved_at
    end,
    updated_at = now();

  insert into public.overtime_approval_audit (
    company_id,
    employee_user_id,
    work_date,
    previous_status,
    new_status,
    suggested_overtime_hours,
    suggested_double_hours,
    notes,
    changed_by
  )
  values (
    target_company_id,
    admin_set_overtime_approval.employee_user_id,
    admin_set_overtime_approval.work_date,
    previous_status,
    approval_status,
    greatest(coalesce(suggested_overtime_hours, 0), 0),
    greatest(coalesce(suggested_double_hours, 0), 0),
    approval_notes,
    auth.uid()
  );
end;
$$;

grant execute on function public.admin_set_overtime_approval(uuid, date, numeric, numeric, text, text) to authenticated;

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

  perform public.assert_payroll_period_open(timezone('America/Costa_Rica', original_record.created_at)::date);
  perform public.assert_payroll_period_open(timezone('America/Costa_Rica', corrected_created_at)::date);

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

select pg_notify('pgrst', 'reload schema');
