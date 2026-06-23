-- Patch 016: supervisor assignment and attendance validation.
-- Additive migration. It does not update or delete existing attendance marks.

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('employee', 'Supervisor', 'admin', 'superadmin'));

create or replace function public.admin_sync_auth_user_hr_record(
  target_auth_user_id uuid,
  target_full_name text,
  target_email text,
  target_phone text default null,
  target_identification text default null,
  target_position text default null,
  target_hire_date date default null,
  target_role text default 'employee',
  target_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid := public.get_default_company_id();
  saved_profile_id uuid;
  saved_employee_id uuid;
begin
  if target_company_id is null then
    insert into public.companies (name) values ('Empresa principal')
    returning id into target_company_id;
  end if;

  insert into public.profiles (auth_user_id, company_id, full_name, email, phone, role, status)
  values (
    target_auth_user_id,
    target_company_id,
    coalesce(nullif(btrim(target_full_name), ''), target_email, ''),
    nullif(btrim(target_email), ''),
    nullif(btrim(target_phone), ''),
    case when target_role in ('employee', 'Supervisor', 'admin', 'superadmin') then target_role else 'employee' end,
    case when target_status in ('active', 'inactive') then target_status else 'active' end
  )
  on conflict (auth_user_id) do update set
    company_id = excluded.company_id,
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    status = excluded.status,
    updated_at = now()
  returning id into saved_profile_id;

  insert into public.employees (
    company_id, auth_user_id, profile_id, full_name, identification,
    email, phone, hire_date, position, status
  )
  values (
    target_company_id,
    target_auth_user_id,
    saved_profile_id,
    coalesce(nullif(btrim(target_full_name), ''), target_email, ''),
    nullif(btrim(target_identification), ''),
    nullif(btrim(target_email), ''),
    nullif(btrim(target_phone), ''),
    target_hire_date,
    nullif(btrim(target_position), ''),
    case when target_status in ('active', 'inactive', 'terminated') then target_status else 'active' end
  )
  on conflict (auth_user_id) do update set
    company_id = excluded.company_id,
    profile_id = excluded.profile_id,
    full_name = excluded.full_name,
    identification = excluded.identification,
    email = excluded.email,
    phone = excluded.phone,
    hire_date = excluded.hire_date,
    position = excluded.position,
    status = excluded.status,
    updated_at = now()
  returning id into saved_employee_id;

  return saved_employee_id;
end;
$$;

create table if not exists public.employee_supervisor_assignments (
  id uuid primary key default gen_random_uuid(),
  supervisor_user_id uuid not null references auth.users(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_supervisor_not_self check (supervisor_user_id <> employee_user_id)
);

create unique index if not exists employee_one_active_supervisor_idx
on public.employee_supervisor_assignments (employee_user_id)
where active = true;

create index if not exists employee_supervisor_active_lookup_idx
on public.employee_supervisor_assignments (supervisor_user_id, active);

create table if not exists public.attendance_supervisor_validations (
  id uuid primary key default gen_random_uuid(),
  attendance_id text not null,
  supervisor_user_id uuid not null references auth.users(id) on delete restrict,
  employee_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('confirmed', 'rejected', 'duplicated')),
  comment text,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint attendance_validation_not_self check (supervisor_user_id <> employee_user_id),
  unique (attendance_id, supervisor_user_id)
);

create index if not exists attendance_supervisor_validation_lookup_idx
on public.attendance_supervisor_validations (attendance_id, supervisor_user_id);

drop trigger if exists employee_supervisor_assignments_set_updated_at
on public.employee_supervisor_assignments;
create trigger employee_supervisor_assignments_set_updated_at
before update on public.employee_supervisor_assignments
for each row execute function public.touch_updated_at();

create or replace function public.is_current_user_supervisor()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    (
      select
        u.raw_user_meta_data ->> 'role' = 'Supervisor'
        or u.raw_app_meta_data ->> 'role' = 'Supervisor'
        or p.role = 'Supervisor'
      from auth.users u
      left join public.profiles p on p.auth_user_id = u.id
      where u.id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.get_current_user_attendance_role()
returns text
language sql
security definer
stable
set search_path = public, auth
as $$
  select case
    when public.is_current_user_supervisor() then 'Supervisor'
    when public.is_current_user_hr_admin() then 'admin'
    else 'employee'
  end;
$$;

grant execute on function public.is_current_user_supervisor() to authenticated;
grant execute on function public.get_current_user_attendance_role() to authenticated;

create or replace function public.admin_set_employee_supervisor(
  target_employee_user_id uuid,
  target_supervisor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  if target_employee_user_id is null then
    raise exception 'Debe indicar el empleado.';
  end if;

  if target_supervisor_user_id = target_employee_user_id then
    raise exception 'Una persona no puede supervisarse a si misma.';
  end if;

  if target_supervisor_user_id is not null and not exists (
    select 1
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
    where u.id = target_supervisor_user_id
      and (
        u.raw_user_meta_data ->> 'role' = 'Supervisor'
        or u.raw_app_meta_data ->> 'role' = 'Supervisor'
        or p.role = 'Supervisor'
      )
  ) then
    raise exception 'La persona seleccionada no tiene el rol Supervisor.';
  end if;

  update public.employee_supervisor_assignments
  set active = false, updated_at = now()
  where employee_user_id = target_employee_user_id
    and active = true
    and supervisor_user_id is distinct from target_supervisor_user_id;

  if target_supervisor_user_id is not null then
    insert into public.employee_supervisor_assignments (
      supervisor_user_id,
      employee_user_id,
      active,
      assigned_by
    )
    values (
      target_supervisor_user_id,
      target_employee_user_id,
      true,
      auth.uid()
    )
    on conflict (employee_user_id) where active = true
    do update set
      supervisor_user_id = excluded.supervisor_user_id,
      assigned_by = excluded.assigned_by,
      assigned_at = now(),
      updated_at = now();
  end if;
end;
$$;

grant execute on function public.admin_set_employee_supervisor(uuid, uuid) to authenticated;

create or replace function public.get_pending_supervisor_attendance_validations()
returns table (
  attendance_id text,
  employee_user_id uuid,
  employee_name text,
  tipo text,
  created_at timestamptz,
  ubicacion text,
  validation_status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_current_user_supervisor() then
    raise exception 'Acceso denegado. El usuario no tiene rol Supervisor.';
  end if;

  return query
  select
    a.id::text,
    a.user_id,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      split_part(u.email::text, '@', 1)
    ),
    a.tipo::text,
    a.created_at,
    coalesce(a.ubicacion::text, ''),
    'pending'::text
  from public.asistencias a
  join public.employee_supervisor_assignments esa
    on esa.employee_user_id = a.user_id
   and esa.supervisor_user_id = auth.uid()
   and esa.active = true
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.auth_user_id = a.user_id
  left join public.employees e on e.auth_user_id = a.user_id
  left join public.attendance_supervisor_validations v
    on v.attendance_id = a.id::text
   and v.supervisor_user_id = auth.uid()
  where a.created_at >= now() - interval '7 days'
    and a.user_id <> auth.uid()
    and v.id is null
  order by a.created_at desc;
end;
$$;

grant execute on function public.get_pending_supervisor_attendance_validations() to authenticated;

create or replace function public.validate_attendance_by_supervisor(
  attendance_id text,
  validation_status text,
  validation_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  mark_employee_user_id uuid;
  saved_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_supervisor() then
    raise exception 'Acceso denegado. El usuario no tiene rol Supervisor.';
  end if;

  if validation_status not in ('confirmed', 'rejected', 'duplicated') then
    raise exception 'Estado de validacion no valido.';
  end if;

  select a.user_id into mark_employee_user_id
  from public.asistencias a
  where a.id::text = validate_attendance_by_supervisor.attendance_id
    and a.created_at >= now() - interval '7 days';

  if mark_employee_user_id is null then
    raise exception 'La marca no existe o ya no pertenece al periodo autorizable.';
  end if;

  if mark_employee_user_id = auth.uid() then
    raise exception 'No puede validar sus propias marcas.';
  end if;

  if not exists (
    select 1
    from public.employee_supervisor_assignments esa
    where esa.supervisor_user_id = auth.uid()
      and esa.employee_user_id = mark_employee_user_id
      and esa.active = true
  ) then
    raise exception 'La marca no pertenece a una persona asignada a este Supervisor.';
  end if;

  insert into public.attendance_supervisor_validations (
    attendance_id,
    supervisor_user_id,
    employee_user_id,
    status,
    comment
  )
  values (
    validate_attendance_by_supervisor.attendance_id,
    auth.uid(),
    mark_employee_user_id,
    validation_status,
    nullif(btrim(validation_comment), '')
  )
  returning id into saved_id;

  return saved_id;
exception
  when unique_violation then
    raise exception 'Esta marca ya fue validada por el Supervisor.';
end;
$$;

grant execute on function public.validate_attendance_by_supervisor(text, text, text) to authenticated;

drop function if exists public.get_employee_directory();
create function public.get_employee_directory()
returns table (
  user_id uuid,
  employee_id uuid,
  profile_id uuid,
  email text,
  display_name text,
  nombre text,
  apellidos text,
  identification text,
  phone text,
  job_position text,
  hire_date date,
  employee_status text,
  is_admin boolean,
  is_supervisor boolean,
  supervisor_user_id uuid,
  supervisor_name text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    u.id,
    e.id,
    p.id,
    u.email::text,
    coalesce(nullif(e.full_name, ''), nullif(p.full_name, ''), nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(u.email::text, '@', 1)),
    coalesce(u.raw_user_meta_data ->> 'nombre', split_part(coalesce(e.full_name, p.full_name, ''), ' ', 1), ''),
    coalesce(u.raw_user_meta_data ->> 'apellidos', nullif(trim(regexp_replace(coalesce(e.full_name, p.full_name, ''), '^[^ ]+\s*', '')), ''), ''),
    coalesce(e.identification, ''),
    coalesce(e.phone, p.phone, ''),
    coalesce(nullif(e.position, ''), nullif(u.raw_user_meta_data ->> 'position', ''), ''),
    e.hire_date,
    coalesce(e.status, p.status, 'active'),
    coalesce((u.raw_user_meta_data ->> 'is_admin')::boolean, false)
      or u.raw_user_meta_data ->> 'role' = 'admin'
      or u.raw_app_meta_data ->> 'role' = 'admin'
      or p.role in ('admin', 'superadmin'),
    u.raw_user_meta_data ->> 'role' = 'Supervisor'
      or u.raw_app_meta_data ->> 'role' = 'Supervisor'
      or p.role = 'Supervisor',
    esa.supervisor_user_id,
    coalesce(nullif(sp.full_name, ''), nullif(su.raw_user_meta_data ->> 'display_name', ''), split_part(su.email::text, '@', 1)),
    coalesce((u.raw_user_meta_data ->> 'is_active')::boolean, true)
      and coalesce(e.status, p.status, 'active') = 'active',
    u.created_at
  from auth.users u
  left join public.profiles p on p.auth_user_id = u.id
  left join public.employees e on e.auth_user_id = u.id
  left join public.employee_supervisor_assignments esa on esa.employee_user_id = u.id and esa.active = true
  left join auth.users su on su.id = esa.supervisor_user_id
  left join public.profiles sp on sp.auth_user_id = esa.supervisor_user_id
  order by 5 asc, 4 asc;
end;
$$;

grant execute on function public.get_employee_directory() to authenticated;

drop function if exists public.get_attendance_report(uuid, date, date);
create function public.get_attendance_report(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null
)
returns table (
  id text,
  user_id uuid,
  employee_name text,
  employee_email text,
  attendance_date text,
  attendance_time text,
  tipo text,
  ubicacion text,
  descripcion text,
  latitud double precision,
  longitud double precision,
  ip text,
  created_at timestamptz,
  supervisor_validation_status text,
  supervisor_name text,
  supervisor_validated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_hr_admin();

  return query
  select
    a.id::text,
    a.user_id,
    coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(p.full_name, ''), split_part(u.email::text, '@', 1)),
    u.email::text,
    to_char(timezone('America/Costa_Rica', a.created_at), 'YYYY-MM-DD'),
    to_char(timezone('America/Costa_Rica', a.created_at), 'HH24:MI:SS'),
    a.tipo::text,
    a.ubicacion::text,
    a.descripcion::text,
    a.latitud,
    a.longitud,
    a.ip::text,
    a.created_at,
    case
      when esa.id is null then 'no_required'
      when v.id is null then 'pending'
      else v.status
    end,
    coalesce(nullif(sp.full_name, ''), nullif(su.raw_user_meta_data ->> 'display_name', ''), split_part(su.email::text, '@', 1)),
    v.validated_at
  from public.asistencias a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.auth_user_id = a.user_id
  left join public.employee_supervisor_assignments esa on esa.employee_user_id = a.user_id and esa.active = true
  left join auth.users su on su.id = esa.supervisor_user_id
  left join public.profiles sp on sp.auth_user_id = esa.supervisor_user_id
  left join public.attendance_supervisor_validations v
    on v.attendance_id = a.id::text
   and v.supervisor_user_id = esa.supervisor_user_id
  where (filter_user_id is null or a.user_id = filter_user_id)
    and (filter_start_date is null or timezone('America/Costa_Rica', a.created_at)::date >= filter_start_date)
    and (filter_end_date is null or timezone('America/Costa_Rica', a.created_at)::date <= filter_end_date)
  order by employee_name asc, attendance_date asc, a.created_at asc;
end;
$$;

grant execute on function public.get_attendance_report(uuid, date, date) to authenticated;

alter table public.employee_supervisor_assignments enable row level security;
alter table public.attendance_supervisor_validations enable row level security;

drop policy if exists supervisor_read_own_assignments on public.employee_supervisor_assignments;
create policy supervisor_read_own_assignments on public.employee_supervisor_assignments
for select to authenticated
using (supervisor_user_id = auth.uid() or public.is_current_user_hr_admin());

drop policy if exists hr_admin_manage_supervisor_assignments on public.employee_supervisor_assignments;
create policy hr_admin_manage_supervisor_assignments on public.employee_supervisor_assignments
for all to authenticated
using (public.is_current_user_hr_admin())
with check (public.is_current_user_hr_admin());

drop policy if exists supervisor_read_own_validations on public.attendance_supervisor_validations;
create policy supervisor_read_own_validations on public.attendance_supervisor_validations
for select to authenticated
using (supervisor_user_id = auth.uid() or public.is_current_user_hr_admin());

revoke insert, update, delete on public.attendance_supervisor_validations from authenticated;
revoke insert, update, delete on public.employee_supervisor_assignments from authenticated;
