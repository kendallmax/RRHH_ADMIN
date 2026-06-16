-- Patch 005: exposes saved hour calculations for the admin UI.

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

notify pgrst, 'reload schema';
