-- Patch 003: connects the employee directory to profiles/employees.
-- Run after the foundation migration.

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
    insert into public.companies (name)
    values ('Empresa principal')
    returning id into target_company_id;
  end if;

  insert into public.profiles (
    auth_user_id,
    company_id,
    full_name,
    email,
    phone,
    role,
    status
  )
  values (
    target_auth_user_id,
    target_company_id,
    coalesce(nullif(btrim(target_full_name), ''), target_email, ''),
    nullif(btrim(target_email), ''),
    nullif(btrim(target_phone), ''),
    case when target_role in ('employee', 'admin', 'superadmin') then target_role else 'employee' end,
    case when target_status in ('active', 'inactive') then target_status else 'active' end
  )
  on conflict (auth_user_id) do update
  set
    company_id = excluded.company_id,
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    status = excluded.status,
    updated_at = now()
  returning id into saved_profile_id;

  insert into public.employees (
    company_id,
    auth_user_id,
    profile_id,
    full_name,
    identification,
    email,
    phone,
    hire_date,
    position,
    status
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
  on conflict (auth_user_id) do update
  set
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

grant execute on function public.admin_sync_auth_user_hr_record(
  uuid, text, text, text, text, text, date, text, text
) to authenticated, service_role;

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
    u.id as user_id,
    e.id as employee_id,
    p.id as profile_id,
    u.email::text as email,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'apellidos')), ''),
      split_part(u.email::text, '@', 1)
    ) as display_name,
    coalesce(u.raw_user_meta_data ->> 'nombre', split_part(coalesce(e.full_name, p.full_name, ''), ' ', 1), '') as nombre,
    coalesce(
      u.raw_user_meta_data ->> 'apellidos',
      nullif(trim(regexp_replace(coalesce(e.full_name, p.full_name, ''), '^[^ ]+\\s*', '')), ''),
      ''
    ) as apellidos,
    coalesce(e.identification, '') as identification,
    coalesce(e.phone, p.phone, '') as phone,
    coalesce(nullif(e.position, ''), nullif(u.raw_user_meta_data ->> 'position', ''), '') as job_position,
    e.hire_date,
    coalesce(e.status, p.status, 'active') as employee_status,
    coalesce((u.raw_user_meta_data ->> 'is_admin')::boolean, false)
      or coalesce(u.raw_user_meta_data ->> 'role' = 'admin', false)
      or coalesce(u.raw_app_meta_data ->> 'role' = 'admin', false)
      or p.role in ('admin', 'superadmin') as is_admin,
    coalesce((u.raw_user_meta_data ->> 'is_active')::boolean, true)
      and coalesce(e.status, p.status, 'active') = 'active' as is_active,
    u.created_at
  from auth.users u
  left join public.profiles p on p.auth_user_id = u.id
  left join public.employees e on e.auth_user_id = u.id
  order by 5 asc, 4 asc;
end;
$$;

grant execute on function public.get_employee_directory() to authenticated;
