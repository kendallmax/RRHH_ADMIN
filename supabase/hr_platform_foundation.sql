-- Foundation schema for the attendance and HR platform.
-- This migration is intentionally additive: it keeps the current `asistencias`
-- table intact while adding configurable HR structures around it.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id),
  full_name text not null default '',
  email text,
  phone text,
  role text not null default 'employee' check (role in ('employee', 'admin', 'superadmin')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  calculation_mode text not null default 'weekly'
    check (calculation_mode in ('weekly', 'biweekly', 'monthly_fixed')),
  start_time time,
  end_time time,
  lunch_minutes integer not null default 60 check (lunch_minutes >= 0),
  requires_lunch_out boolean not null default false,
  requires_lunch_in boolean not null default false,
  auto_deduct_lunch boolean not null default true,
  late_tolerance_minutes integer not null default 0 check (late_tolerance_minutes >= 0),
  overtime_minimum_minutes integer not null default 60 check (overtime_minimum_minutes >= 0),
  rounding_rule text not null default 'none'
    check (rounding_rule in ('none', 'nearest_15', 'nearest_30', 'up_15', 'up_30')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.overtime_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period_type text not null default 'weekly' check (period_type in ('daily', 'weekly', 'biweekly', 'monthly')),
  daily_regular_hours numeric(6,2) not null default 8 check (daily_regular_hours >= 0),
  weekly_regular_hours numeric(6,2) not null default 48 check (weekly_regular_hours >= 0),
  biweekly_regular_hours numeric(6,2) not null default 96 check (biweekly_regular_hours >= 0),
  daily_overtime_before_double numeric(6,2) not null default 4 check (daily_overtime_before_double >= 0),
  sunday_rule text not null default 'configurable'
    check (sunday_rule in ('ordinary', 'overtime', 'double', 'rest_day', 'holiday', 'configurable')),
  holiday_rule text not null default 'configurable'
    check (holiday_rule in ('ordinary', 'overtime', 'double', 'configurable')),
  requires_overtime_approval boolean not null default true,
  requires_second_approval boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  department_id uuid references public.departments(id),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  identification text,
  email text,
  phone text,
  hire_date date,
  termination_date date,
  position text,
  status text not null default 'active' check (status in ('active', 'inactive', 'terminated')),
  work_schedule_id uuid references public.work_schedules(id),
  overtime_rule_id uuid references public.overtime_rules(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_mark_audit (
  id uuid primary key default gen_random_uuid(),
  attendance_mark_id text not null,
  original_payload jsonb not null,
  corrected_payload jsonb,
  action text not null check (action in ('manual_create', 'correction', 'rejection', 'restore')),
  reason text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create table if not exists public.hour_calculations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  entry_time time,
  lunch_out_time time,
  lunch_in_time time,
  exit_time time,
  worked_hours numeric(7,2) not null default 0,
  regular_hours numeric(7,2) not null default 0,
  overtime_hours numeric(7,2) not null default 0,
  double_hours numeric(7,2) not null default 0,
  calculation_status text not null default 'draft'
    check (calculation_status in ('draft', 'complete', 'requires_review', 'approved', 'paid')),
  observations text[] not null default '{}',
  raw_mark_ids text[] not null default '{}',
  calculated_by uuid references auth.users(id),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_user_id, work_date)
);

create table if not exists public.overtime_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  suggested_overtime_hours numeric(7,2) not null default 0,
  suggested_double_hours numeric(7,2) not null default 0,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'approved_for_payroll', 'requires_correction', 'paid')),
  notes text,
  first_approved_by uuid references auth.users(id),
  first_approved_at timestamptz,
  second_approved_by uuid references auth.users(id),
  second_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_user_id, work_date)
);

create table if not exists public.overtime_approval_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  previous_status text,
  new_status text not null,
  suggested_overtime_hours numeric(7,2) not null default 0,
  suggested_double_hours numeric(7,2) not null default 0,
  notes text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies',
    'departments',
    'profiles',
    'employees',
    'work_schedules',
    'overtime_rules',
    'hour_calculations',
    'overtime_approvals',
    'payroll_periods'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

insert into public.companies (name)
select 'Empresa principal'
where not exists (
  select 1
  from public.companies
  where name = 'Empresa principal'
);

alter table public.asistencias
alter column tipo type text
using tipo::text;

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

create or replace function public.get_default_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.companies
  order by created_at asc
  limit 1;
$$;

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

create or replace function public.sync_current_auth_profile()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_profile_id uuid;
begin
  insert into public.profiles (
    auth_user_id,
    company_id,
    full_name,
    email,
    role,
    status
  )
  select
    u.id,
    public.get_default_company_id(),
    coalesce(
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'apellidos')), ''),
      split_part(u.email::text, '@', 1)
    ),
    u.email::text,
    case
      when coalesce((u.raw_user_meta_data ->> 'is_admin')::boolean, false)
        or coalesce(u.raw_user_meta_data ->> 'role' = 'admin', false)
        or coalesce(u.raw_app_meta_data ->> 'role' = 'admin', false)
      then 'admin'
      else 'employee'
    end,
    case when coalesce((u.raw_user_meta_data ->> 'is_active')::boolean, true) then 'active' else 'inactive' end
  from auth.users u
  where u.id = auth.uid()
  on conflict (auth_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    updated_at = now()
  returning id into saved_profile_id;

  return saved_profile_id;
end;
$$;

insert into public.overtime_rules (
  company_id,
  name,
  period_type,
  daily_regular_hours,
  weekly_regular_hours,
  biweekly_regular_hours,
  daily_overtime_before_double,
  sunday_rule,
  holiday_rule,
  requires_overtime_approval,
  requires_second_approval
)
select
  public.get_default_company_id(),
  'Regla base Costa Rica configurable',
  'weekly',
  8,
  48,
  96,
  4,
  'configurable',
  'configurable',
  true,
  false
where public.get_default_company_id() is not null
on conflict (company_id, name) do nothing;

insert into public.work_schedules (
  company_id,
  name,
  calculation_mode,
  start_time,
  end_time,
  lunch_minutes,
  requires_lunch_out,
  requires_lunch_in,
  auto_deduct_lunch,
  overtime_minimum_minutes
)
select
  public.get_default_company_id(),
  'Horario base configurable',
  'weekly',
  '08:00',
  '17:00',
  60,
  false,
  false,
  true,
  60
where public.get_default_company_id() is not null
on conflict (company_id, name) do nothing;

create or replace function public.admin_get_attendance_settings()
returns table (
  company_id uuid,
  company_name text,
  work_schedule_id uuid,
  overtime_rule_id uuid,
  calculation_mode text,
  period_type text,
  start_time text,
  end_time text,
  lunch_minutes integer,
  requires_lunch_out boolean,
  requires_lunch_in boolean,
  auto_deduct_lunch boolean,
  late_tolerance_minutes integer,
  overtime_minimum_minutes integer,
  rounding_rule text,
  daily_regular_hours numeric,
  weekly_regular_hours numeric,
  biweekly_regular_hours numeric,
  daily_overtime_before_double numeric,
  sunday_rule text,
  holiday_rule text,
  requires_overtime_approval boolean,
  requires_second_approval boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    c.id,
    c.name,
    ws.id,
    ot.id,
    ws.calculation_mode,
    ot.period_type,
    ws.start_time::text,
    ws.end_time::text,
    ws.lunch_minutes,
    ws.requires_lunch_out,
    ws.requires_lunch_in,
    ws.auto_deduct_lunch,
    ws.late_tolerance_minutes,
    ws.overtime_minimum_minutes,
    ws.rounding_rule,
    ot.daily_regular_hours,
    ot.weekly_regular_hours,
    ot.biweekly_regular_hours,
    ot.daily_overtime_before_double,
    ot.sunday_rule,
    ot.holiday_rule,
    ot.requires_overtime_approval,
    ot.requires_second_approval
  from public.companies c
  left join lateral (
    select *
    from public.work_schedules ws_lookup
    where ws_lookup.company_id = c.id and ws_lookup.status = 'active'
    order by created_at asc
    limit 1
  ) ws on true
  left join lateral (
    select *
    from public.overtime_rules ot_lookup
    where ot_lookup.company_id = c.id and ot_lookup.status = 'active'
    order by created_at asc
    limit 1
  ) ot on true
  where c.id = public.get_default_company_id();
end;
$$;

grant execute on function public.admin_get_attendance_settings() to authenticated;

create or replace function public.admin_upsert_attendance_settings(
  company_name text,
  calculation_mode text,
  period_type text,
  start_time_text text,
  end_time_text text,
  lunch_minutes integer,
  requires_lunch_out boolean,
  requires_lunch_in boolean,
  auto_deduct_lunch boolean,
  late_tolerance_minutes integer,
  overtime_minimum_minutes integer,
  rounding_rule text,
  daily_regular_hours numeric,
  weekly_regular_hours numeric,
  biweekly_regular_hours numeric,
  daily_overtime_before_double numeric,
  sunday_rule text,
  holiday_rule text,
  requires_overtime_approval boolean,
  requires_second_approval boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid;
begin
  perform public.assert_hr_admin();

  target_company_id := public.get_default_company_id();

  if target_company_id is null then
    insert into public.companies (name)
    values (coalesce(nullif(btrim(company_name), ''), 'Empresa principal'))
    returning id into target_company_id;
  else
    update public.companies
    set name = coalesce(nullif(btrim(company_name), ''), name)
    where id = target_company_id;
  end if;

  insert into public.work_schedules (
    company_id,
    name,
    calculation_mode,
    start_time,
    end_time,
    lunch_minutes,
    requires_lunch_out,
    requires_lunch_in,
    auto_deduct_lunch,
    late_tolerance_minutes,
    overtime_minimum_minutes,
    rounding_rule
  )
  values (
    target_company_id,
    'Horario base configurable',
    calculation_mode,
    nullif(start_time_text, '')::time,
    nullif(end_time_text, '')::time,
    greatest(coalesce(lunch_minutes, 0), 0),
    coalesce(requires_lunch_out, false),
    coalesce(requires_lunch_in, false),
    coalesce(auto_deduct_lunch, true),
    greatest(coalesce(late_tolerance_minutes, 0), 0),
    greatest(coalesce(overtime_minimum_minutes, 0), 0),
    rounding_rule
  )
  on conflict (company_id, name) do update
  set
    calculation_mode = excluded.calculation_mode,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    lunch_minutes = excluded.lunch_minutes,
    requires_lunch_out = excluded.requires_lunch_out,
    requires_lunch_in = excluded.requires_lunch_in,
    auto_deduct_lunch = excluded.auto_deduct_lunch,
    late_tolerance_minutes = excluded.late_tolerance_minutes,
    overtime_minimum_minutes = excluded.overtime_minimum_minutes,
    rounding_rule = excluded.rounding_rule,
    updated_at = now();

  insert into public.overtime_rules (
    company_id,
    name,
    period_type,
    daily_regular_hours,
    weekly_regular_hours,
    biweekly_regular_hours,
    daily_overtime_before_double,
    sunday_rule,
    holiday_rule,
    requires_overtime_approval,
    requires_second_approval
  )
  values (
    target_company_id,
    'Regla base Costa Rica configurable',
    period_type,
    greatest(coalesce(daily_regular_hours, 0), 0),
    greatest(coalesce(weekly_regular_hours, 0), 0),
    greatest(coalesce(biweekly_regular_hours, 0), 0),
    greatest(coalesce(daily_overtime_before_double, 0), 0),
    sunday_rule,
    holiday_rule,
    coalesce(requires_overtime_approval, true),
    coalesce(requires_second_approval, false)
  )
  on conflict (company_id, name) do update
  set
    period_type = excluded.period_type,
    daily_regular_hours = excluded.daily_regular_hours,
    weekly_regular_hours = excluded.weekly_regular_hours,
    biweekly_regular_hours = excluded.biweekly_regular_hours,
    daily_overtime_before_double = excluded.daily_overtime_before_double,
    sunday_rule = excluded.sunday_rule,
    holiday_rule = excluded.holiday_rule,
    requires_overtime_approval = excluded.requires_overtime_approval,
    requires_second_approval = excluded.requires_second_approval,
    updated_at = now();
end;
$$;

grant execute on function public.admin_upsert_attendance_settings(
  text, text, text, text, text, integer, boolean, boolean, boolean, integer, integer,
  text, numeric, numeric, numeric, numeric, text, text, boolean, boolean
) to authenticated;

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

create or replace function public.admin_list_overtime_approvals(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  employee_user_id uuid,
  work_date date,
  suggested_overtime_hours numeric,
  suggested_double_hours numeric,
  status text,
  notes text,
  first_approved_by uuid,
  first_approved_at timestamptz,
  second_approved_by uuid,
  second_approved_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    oa.employee_user_id,
    oa.work_date,
    oa.suggested_overtime_hours,
    oa.suggested_double_hours,
    oa.status,
    oa.notes,
    oa.first_approved_by,
    oa.first_approved_at,
    oa.second_approved_by,
    oa.second_approved_at
  from public.overtime_approvals oa
  where (filter_user_id is null or oa.employee_user_id = filter_user_id)
    and (filter_start_date is null or oa.work_date >= filter_start_date)
    and (filter_end_date is null or oa.work_date <= filter_end_date)
  order by oa.work_date desc, oa.employee_user_id;
end;
$$;

grant execute on function public.admin_list_overtime_approvals(uuid, date, date) to authenticated;

create or replace function public.admin_set_overtime_approval(
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

create or replace function public.admin_list_overtime_approval_audit(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  employee_user_id uuid,
  employee_name text,
  employee_email text,
  work_date date,
  previous_status text,
  new_status text,
  suggested_overtime_hours numeric,
  suggested_double_hours numeric,
  notes text,
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
    audit.employee_user_id,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email::text, '@', 1)
    ) as employee_name,
    u.email::text as employee_email,
    audit.work_date,
    audit.previous_status,
    audit.new_status,
    audit.suggested_overtime_hours,
    audit.suggested_double_hours,
    audit.notes,
    coalesce(
      nullif(changer.raw_user_meta_data ->> 'display_name', ''),
      nullif(changer.raw_user_meta_data ->> 'full_name', ''),
      split_part(changer.email::text, '@', 1)
    ) as changed_by_name,
    audit.changed_at
  from public.overtime_approval_audit audit
  join auth.users u on u.id = audit.employee_user_id
  left join auth.users changer on changer.id = audit.changed_by
  left join public.profiles p on p.auth_user_id = audit.employee_user_id
  left join public.employees e on e.auth_user_id = audit.employee_user_id
  where (filter_user_id is null or audit.employee_user_id = filter_user_id)
    and (filter_start_date is null or audit.work_date >= filter_start_date)
    and (filter_end_date is null or audit.work_date <= filter_end_date)
  order by audit.changed_at desc;
end;
$$;

grant execute on function public.admin_list_overtime_approval_audit(uuid, date, date) to authenticated;

create or replace function public.admin_save_hour_calculations(calculations jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid := public.get_default_company_id();
  item jsonb;
  saved_count integer := 0;
begin
  perform public.assert_hr_admin();

  if target_company_id is null then
    raise exception 'No existe una empresa configurada.';
  end if;

  if calculations is null or jsonb_typeof(calculations) <> 'array' then
    raise exception 'El parametro calculations debe ser un arreglo JSON.';
  end if;

  for item in select * from jsonb_array_elements(calculations)
  loop
    insert into public.hour_calculations (
      company_id,
      employee_user_id,
      work_date,
      entry_time,
      lunch_out_time,
      lunch_in_time,
      exit_time,
      worked_hours,
      regular_hours,
      overtime_hours,
      double_hours,
      calculation_status,
      observations,
      raw_mark_ids,
      calculated_by,
      calculated_at
    )
    values (
      target_company_id,
      (item ->> 'employee_user_id')::uuid,
      (item ->> 'work_date')::date,
      nullif(item ->> 'entry_time', '')::time,
      nullif(item ->> 'lunch_out_time', '')::time,
      nullif(item ->> 'lunch_in_time', '')::time,
      nullif(item ->> 'exit_time', '')::time,
      greatest(coalesce((item ->> 'worked_hours')::numeric, 0), 0),
      greatest(coalesce((item ->> 'regular_hours')::numeric, 0), 0),
      greatest(coalesce((item ->> 'overtime_hours')::numeric, 0), 0),
      greatest(coalesce((item ->> 'double_hours')::numeric, 0), 0),
      coalesce(nullif(item ->> 'calculation_status', ''), 'draft'),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item -> 'observations', '[]'::jsonb))),
        '{}'::text[]
      ),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item -> 'raw_mark_ids', '[]'::jsonb))),
        '{}'::text[]
      ),
      auth.uid(),
      now()
    )
    on conflict (company_id, employee_user_id, work_date) do update
    set
      entry_time = excluded.entry_time,
      lunch_out_time = excluded.lunch_out_time,
      lunch_in_time = excluded.lunch_in_time,
      exit_time = excluded.exit_time,
      worked_hours = excluded.worked_hours,
      regular_hours = excluded.regular_hours,
      overtime_hours = excluded.overtime_hours,
      double_hours = excluded.double_hours,
      calculation_status = excluded.calculation_status,
      observations = excluded.observations,
      raw_mark_ids = excluded.raw_mark_ids,
      calculated_by = auth.uid(),
      calculated_at = now(),
      updated_at = now();

    if greatest(coalesce((item ->> 'overtime_hours')::numeric, 0), 0) > 0
      or greatest(coalesce((item ->> 'double_hours')::numeric, 0), 0) > 0
    then
      insert into public.overtime_approvals (
        company_id,
        employee_user_id,
        work_date,
        suggested_overtime_hours,
        suggested_double_hours,
        status,
        notes
      )
      values (
        target_company_id,
        (item ->> 'employee_user_id')::uuid,
        (item ->> 'work_date')::date,
        greatest(coalesce((item ->> 'overtime_hours')::numeric, 0), 0),
        greatest(coalesce((item ->> 'double_hours')::numeric, 0), 0),
        'pending_review',
        'Creado automaticamente al guardar calculos de horas.'
      )
      on conflict (company_id, employee_user_id, work_date) do update
      set
        suggested_overtime_hours = excluded.suggested_overtime_hours,
        suggested_double_hours = excluded.suggested_double_hours,
        updated_at = now();
    end if;

    saved_count := saved_count + 1;
  end loop;

  return saved_count;
end;
$$;

grant execute on function public.admin_save_hour_calculations(jsonb) to authenticated;

create or replace function public.admin_list_hour_calculations(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  employee_user_id uuid,
  work_date date,
  worked_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  double_hours numeric,
  calculation_status text,
  observations text[],
  calculated_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    hc.employee_user_id,
    hc.work_date,
    hc.worked_hours,
    hc.regular_hours,
    hc.overtime_hours,
    hc.double_hours,
    hc.calculation_status,
    hc.observations,
    hc.calculated_at,
    hc.updated_at
  from public.hour_calculations hc
  where (filter_user_id is null or hc.employee_user_id = filter_user_id)
    and (filter_start_date is null or hc.work_date >= filter_start_date)
    and (filter_end_date is null or hc.work_date <= filter_end_date)
  order by hc.work_date desc, hc.employee_user_id;
end;
$$;

grant execute on function public.admin_list_hour_calculations(uuid, date, date) to authenticated;

create or replace function public.admin_get_hours_summary_report(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  employee_user_id uuid,
  employee_name text,
  employee_email text,
  days_calculated integer,
  total_worked_hours numeric,
  total_regular_hours numeric,
  total_overtime_hours numeric,
  total_double_hours numeric,
  pending_approvals integer,
  approved_approvals integer,
  rejected_approvals integer,
  requires_review_days integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    hc.employee_user_id,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email::text, '@', 1)
    ) as employee_name,
    u.email::text as employee_email,
    count(*)::integer as days_calculated,
    coalesce(sum(hc.worked_hours), 0) as total_worked_hours,
    coalesce(sum(hc.regular_hours), 0) as total_regular_hours,
    coalesce(sum(hc.overtime_hours), 0) as total_overtime_hours,
    coalesce(sum(hc.double_hours), 0) as total_double_hours,
    count(*) filter (where oa.status = 'pending_review')::integer as pending_approvals,
    count(*) filter (where oa.status in ('approved', 'approved_for_payroll', 'paid'))::integer as approved_approvals,
    count(*) filter (where oa.status = 'rejected')::integer as rejected_approvals,
    count(*) filter (where hc.calculation_status = 'requires_review')::integer as requires_review_days
  from public.hour_calculations hc
  join auth.users u on u.id = hc.employee_user_id
  left join public.profiles p on p.auth_user_id = hc.employee_user_id
  left join public.employees e on e.auth_user_id = hc.employee_user_id
  left join public.overtime_approvals oa
    on oa.company_id = hc.company_id
    and oa.employee_user_id = hc.employee_user_id
    and oa.work_date = hc.work_date
  where (filter_user_id is null or hc.employee_user_id = filter_user_id)
    and (filter_start_date is null or hc.work_date >= filter_start_date)
    and (filter_end_date is null or hc.work_date <= filter_end_date)
  group by hc.employee_user_id, employee_name, employee_email
  order by employee_name asc;
end;
$$;

grant execute on function public.admin_get_hours_summary_report(uuid, date, date) to authenticated;

create or replace function public.admin_get_payroll_export_report(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  employee_user_id uuid,
  employee_name text,
  employee_email text,
  identification text,
  job_position text,
  period_start date,
  period_end date,
  days_calculated integer,
  total_worked_hours numeric,
  regular_hours_to_pay numeric,
  approved_overtime_hours_to_pay numeric,
  approved_double_hours_to_pay numeric,
  pending_overtime_hours numeric,
  pending_double_hours numeric,
  rejected_overtime_hours numeric,
  rejected_double_hours numeric,
  requires_review_days integer,
  closed_periods integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    hc.employee_user_id,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email::text, '@', 1)
    ) as employee_name,
    u.email::text as employee_email,
    coalesce(nullif(e.identification, ''), nullif(u.raw_user_meta_data ->> 'identification', '')) as identification,
    coalesce(nullif(e.position, ''), nullif(u.raw_user_meta_data ->> 'position', '')) as job_position,
    min(hc.work_date) as period_start,
    max(hc.work_date) as period_end,
    count(*)::integer as days_calculated,
    coalesce(sum(hc.worked_hours), 0) as total_worked_hours,
    coalesce(sum(hc.regular_hours), 0) as regular_hours_to_pay,
    coalesce(sum(case when oa.status in ('approved', 'approved_for_payroll', 'paid') then hc.overtime_hours else 0 end), 0) as approved_overtime_hours_to_pay,
    coalesce(sum(case when oa.status in ('approved', 'approved_for_payroll', 'paid') then hc.double_hours else 0 end), 0) as approved_double_hours_to_pay,
    coalesce(sum(case when coalesce(oa.status, 'pending_review') in ('pending_review', 'requires_correction') then hc.overtime_hours else 0 end), 0) as pending_overtime_hours,
    coalesce(sum(case when coalesce(oa.status, 'pending_review') in ('pending_review', 'requires_correction') then hc.double_hours else 0 end), 0) as pending_double_hours,
    coalesce(sum(case when oa.status = 'rejected' then hc.overtime_hours else 0 end), 0) as rejected_overtime_hours,
    coalesce(sum(case when oa.status = 'rejected' then hc.double_hours else 0 end), 0) as rejected_double_hours,
    count(*) filter (where hc.calculation_status = 'requires_review')::integer as requires_review_days,
    count(distinct pp.id)::integer as closed_periods
  from public.hour_calculations hc
  join auth.users u on u.id = hc.employee_user_id
  left join public.profiles p on p.auth_user_id = hc.employee_user_id
  left join public.employees e on e.auth_user_id = hc.employee_user_id
  left join public.overtime_approvals oa
    on oa.company_id = hc.company_id
    and oa.employee_user_id = hc.employee_user_id
    and oa.work_date = hc.work_date
  left join public.payroll_periods pp
    on pp.company_id = hc.company_id
    and pp.status = 'closed'
    and hc.work_date between pp.start_date and pp.end_date
  where (filter_user_id is null or hc.employee_user_id = filter_user_id)
    and (filter_start_date is null or hc.work_date >= filter_start_date)
    and (filter_end_date is null or hc.work_date <= filter_end_date)
  group by
    hc.employee_user_id,
    employee_name,
    employee_email,
    identification,
    job_position
  order by employee_name asc;
end;
$$;

grant execute on function public.admin_get_payroll_export_report(uuid, date, date) to authenticated;

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

alter table public.companies enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.work_schedules enable row level security;
alter table public.overtime_rules enable row level security;
alter table public.attendance_mark_audit enable row level security;
alter table public.hour_calculations enable row level security;
alter table public.overtime_approvals enable row level security;
alter table public.overtime_approval_audit enable row level security;
alter table public.payroll_periods enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
for select
to authenticated
using (auth_user_id = auth.uid() or public.is_current_user_hr_admin());

drop policy if exists hr_admin_read_companies on public.companies;
create policy hr_admin_read_companies on public.companies
for select
to authenticated
using (public.is_current_user_hr_admin());

drop policy if exists hr_admin_read_departments on public.departments;
create policy hr_admin_read_departments on public.departments
for select
to authenticated
using (public.is_current_user_hr_admin());

drop policy if exists hr_admin_read_employees on public.employees;
create policy hr_admin_read_employees on public.employees
for select
to authenticated
using (public.is_current_user_hr_admin() or auth_user_id = auth.uid());

drop policy if exists hr_admin_manage_platform_tables on public.work_schedules;
create policy hr_admin_manage_platform_tables on public.work_schedules
for all
to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop policy if exists hr_admin_manage_overtime_rules on public.overtime_rules;
create policy hr_admin_manage_overtime_rules on public.overtime_rules
for all
to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop policy if exists hr_admin_manage_hour_calculations on public.hour_calculations;
create policy hr_admin_manage_hour_calculations on public.hour_calculations
for all
to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop policy if exists hr_admin_manage_overtime_approvals on public.overtime_approvals;
create policy hr_admin_manage_overtime_approvals on public.overtime_approvals
for all
to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop policy if exists hr_admin_read_overtime_approval_audit on public.overtime_approval_audit;
create policy hr_admin_read_overtime_approval_audit on public.overtime_approval_audit
for select
to authenticated
using (public.is_current_user_hr_admin());

drop policy if exists hr_admin_manage_payroll_periods on public.payroll_periods;
create policy hr_admin_manage_payroll_periods on public.payroll_periods
for all
to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop policy if exists hr_admin_read_mark_audit on public.attendance_mark_audit;
create policy hr_admin_read_mark_audit on public.attendance_mark_audit
for select
to authenticated
using (public.is_current_user_hr_admin());
