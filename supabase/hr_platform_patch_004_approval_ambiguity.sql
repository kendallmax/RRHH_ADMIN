-- Patch 004: fixes ambiguous parameter names in overtime approval RPC.

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
begin
  perform public.assert_hr_admin();

  if approval_status not in ('pending_review', 'approved', 'rejected', 'approved_for_payroll', 'requires_correction', 'paid') then
    raise exception 'Estado de aprobacion no valido.';
  end if;

  if target_company_id is null then
    raise exception 'No existe una empresa configurada.';
  end if;

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
end;
$$;

grant execute on function public.admin_set_overtime_approval(uuid, date, numeric, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
