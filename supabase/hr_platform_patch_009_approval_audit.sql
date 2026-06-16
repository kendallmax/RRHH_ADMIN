-- Patch 009: audit trail for overtime approval decisions.

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

alter table public.overtime_approval_audit enable row level security;

drop policy if exists hr_admin_read_overtime_approval_audit on public.overtime_approval_audit;
create policy hr_admin_read_overtime_approval_audit on public.overtime_approval_audit
for select
to authenticated
using (public.is_current_user_hr_admin());

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

select pg_notify('pgrst', 'reload schema');
