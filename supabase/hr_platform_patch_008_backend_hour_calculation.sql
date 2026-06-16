-- Patch 008: backend hour calculation from raw attendance marks.

create or replace function public.admin_calculate_hours_from_marks(
  filter_user_id uuid default null,
  filter_start_date date default null,
  filter_end_date date default null,
  persist_results boolean default false
)
returns table (
  employee_user_id uuid,
  employee_name text,
  employee_email text,
  work_date date,
  entry_time text,
  lunch_out_time text,
  lunch_in_time text,
  exit_time text,
  worked_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  double_hours numeric,
  calculation_status text,
  observations text[],
  raw_mark_ids text[]
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid := public.get_default_company_id();
  settings record;
  result_row record;
begin
  perform public.assert_hr_admin();

  if target_company_id is null then
    raise exception 'No existe una empresa configurada.';
  end if;

  select
    coalesce(ws.lunch_minutes, 60) as lunch_minutes,
    coalesce(ws.requires_lunch_out, false) as requires_lunch_out,
    coalesce(ws.requires_lunch_in, false) as requires_lunch_in,
    coalesce(ws.auto_deduct_lunch, true) as auto_deduct_lunch,
    coalesce(ot.daily_regular_hours, 8) as daily_regular_hours,
    coalesce(ot.daily_overtime_before_double, 4) as daily_overtime_before_double
  into settings
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
  where c.id = target_company_id;

  create temporary table if not exists pg_temp.backend_hour_results (
    employee_user_id uuid,
    employee_name text,
    employee_email text,
    work_date date,
    entry_time text,
    lunch_out_time text,
    lunch_in_time text,
    exit_time text,
    worked_hours numeric,
    regular_hours numeric,
    overtime_hours numeric,
    double_hours numeric,
    calculation_status text,
    observations text[],
    raw_mark_ids text[]
  ) on commit drop;

  truncate table pg_temp.backend_hour_results;

  insert into pg_temp.backend_hour_results
  with normalized_marks as (
    select
      a.id::text as mark_id,
      a.user_id,
      timezone('America/Costa_Rica', a.created_at)::date as work_date,
      timezone('America/Costa_Rica', a.created_at)::time as mark_time,
      a.created_at,
      a.tipo::text as mark_type
    from public.asistencias a
    where (filter_user_id is null or a.user_id = filter_user_id)
      and (filter_start_date is null or timezone('America/Costa_Rica', a.created_at)::date >= filter_start_date)
      and (filter_end_date is null or timezone('America/Costa_Rica', a.created_at)::date <= filter_end_date)
  ),
  grouped as (
    select
      nm.user_id,
      nm.work_date,
      min(nm.created_at) filter (where nm.mark_type = 'entrada') as entry_at,
      min(nm.created_at) filter (where nm.mark_type in ('salida_almuerzo', 'almuerzo_salida')) as lunch_out_at,
      min(nm.created_at) filter (where nm.mark_type in ('entrada_almuerzo', 'almuerzo_entrada')) as lunch_in_at,
      max(nm.created_at) filter (where nm.mark_type in ('salida', 'salida_final')) as exit_at,
      array_agg(nm.mark_id order by nm.created_at) as raw_mark_ids
    from normalized_marks nm
    group by nm.user_id, nm.work_date
  ),
  calculated as (
    select
      g.user_id,
      g.work_date,
      g.entry_at,
      g.lunch_out_at,
      g.lunch_in_at,
      g.exit_at,
      g.raw_mark_ids,
      greatest(
        0,
        coalesce(extract(epoch from (g.exit_at - g.entry_at)) / 3600, 0)
        - case
            when g.lunch_out_at is not null and g.lunch_in_at is not null
              then greatest(0, extract(epoch from (g.lunch_in_at - g.lunch_out_at)) / 3600)
            when not (settings.requires_lunch_out or settings.requires_lunch_in)
              and settings.auto_deduct_lunch
              then coalesce(settings.lunch_minutes, 0)::numeric / 60
            else 0
          end
      ) as worked_hours
    from grouped g
  ),
  classified as (
    select
      c.*,
      least(c.worked_hours, settings.daily_regular_hours) as regular_hours,
      least(greatest(c.worked_hours - settings.daily_regular_hours, 0), settings.daily_overtime_before_double) as overtime_hours,
      greatest(c.worked_hours - settings.daily_regular_hours - settings.daily_overtime_before_double, 0) as double_hours
    from calculated c
  )
  select
    cl.user_id as employee_user_id,
    coalesce(
      nullif(e.full_name, ''),
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email::text, '@', 1)
    ) as employee_name,
    u.email::text as employee_email,
    cl.work_date,
    to_char(timezone('America/Costa_Rica', cl.entry_at), 'HH24:MI:SS') as entry_time,
    to_char(timezone('America/Costa_Rica', cl.lunch_out_at), 'HH24:MI:SS') as lunch_out_time,
    to_char(timezone('America/Costa_Rica', cl.lunch_in_at), 'HH24:MI:SS') as lunch_in_time,
    to_char(timezone('America/Costa_Rica', cl.exit_at), 'HH24:MI:SS') as exit_time,
    round(cl.worked_hours::numeric, 2) as worked_hours,
    round(cl.regular_hours::numeric, 2) as regular_hours,
    round(cl.overtime_hours::numeric, 2) as overtime_hours,
    round(cl.double_hours::numeric, 2) as double_hours,
    case
      when cl.entry_at is null or cl.exit_at is null then 'requires_review'
      else 'complete'
    end as calculation_status,
    array_remove(array[
      case when cl.entry_at is null then 'Falta entrada' end,
      case when cl.exit_at is null then 'Falta salida' end,
      case when (settings.requires_lunch_out or settings.requires_lunch_in)
        and (cl.lunch_out_at is null or cl.lunch_in_at is null) then 'Almuerzo no marcado' end,
      case when not (settings.requires_lunch_out or settings.requires_lunch_in)
        and settings.auto_deduct_lunch
        and cl.lunch_out_at is null
        and cl.lunch_in_at is null then 'Almuerzo descontado automaticamente' end,
      case when cl.overtime_hours > 0 then 'Horas extra pendientes de aprobacion' end,
      case when cl.double_hours > 0 then 'Horas dobles sugeridas' end
    ], null)::text[] as observations,
    cl.raw_mark_ids
  from classified cl
  join auth.users u on u.id = cl.user_id
  left join public.profiles p on p.auth_user_id = cl.user_id
  left join public.employees e on e.auth_user_id = cl.user_id
  order by cl.work_date asc, employee_name asc;

  update pg_temp.backend_hour_results
  set observations = array['Dia completo']
  where cardinality(observations) = 0;

  if persist_results then
    for result_row in select * from pg_temp.backend_hour_results
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
        result_row.employee_user_id,
        result_row.work_date,
        nullif(result_row.entry_time, '')::time,
        nullif(result_row.lunch_out_time, '')::time,
        nullif(result_row.lunch_in_time, '')::time,
        nullif(result_row.exit_time, '')::time,
        result_row.worked_hours,
        result_row.regular_hours,
        result_row.overtime_hours,
        result_row.double_hours,
        result_row.calculation_status,
        result_row.observations,
        result_row.raw_mark_ids,
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

      if result_row.overtime_hours > 0 or result_row.double_hours > 0 then
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
          result_row.employee_user_id,
          result_row.work_date,
          result_row.overtime_hours,
          result_row.double_hours,
          'pending_review',
          'Creado automaticamente por calculo backend.'
        )
        on conflict on constraint overtime_approvals_company_id_employee_user_id_work_date_key do update
        set
          suggested_overtime_hours = excluded.suggested_overtime_hours,
          suggested_double_hours = excluded.suggested_double_hours,
          updated_at = now();
      end if;
    end loop;
  end if;

  return query select * from pg_temp.backend_hour_results;
end;
$$;

grant execute on function public.admin_calculate_hours_from_marks(uuid, date, date, boolean) to authenticated;

notify pgrst, 'reload schema';
