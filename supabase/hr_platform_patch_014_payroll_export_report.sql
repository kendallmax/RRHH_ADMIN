-- Patch 014: payroll-ready export report from persisted hour calculations.

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

select pg_notify('pgrst', 'reload schema');
