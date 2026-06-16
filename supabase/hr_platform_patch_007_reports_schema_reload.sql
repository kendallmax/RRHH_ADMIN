-- Patch 007: recreates the persisted hours summary RPC and forces PostgREST schema reload.
-- Use this if the UI reports that admin_get_hours_summary_report is missing from schema cache.

drop function if exists public.admin_get_hours_summary_report(uuid, date, date);

create function public.admin_get_hours_summary_report(
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

select pg_notify('pgrst', 'reload schema');
