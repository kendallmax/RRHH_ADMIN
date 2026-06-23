-- Patch 015: show employee position from Auth metadata when the employee row is not populated.

create or replace function public.get_employee_directory()
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
