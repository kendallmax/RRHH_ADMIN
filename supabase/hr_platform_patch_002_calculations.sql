-- Patch 002: fixes settings RPC ambiguity and adds persistent hour calculations.
-- Run this after `hr_platform_foundation.sql` if the foundation was already applied.

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
    order by ws_lookup.created_at asc
    limit 1
  ) ws on true
  left join lateral (
    select *
    from public.overtime_rules ot_lookup
    where ot_lookup.company_id = c.id and ot_lookup.status = 'active'
    order by ot_lookup.created_at asc
    limit 1
  ) ot on true
  where c.id = public.get_default_company_id();
end;
$$;

grant execute on function public.admin_get_attendance_settings() to authenticated;

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
