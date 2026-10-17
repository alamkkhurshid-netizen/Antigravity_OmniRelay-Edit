-- OEM Panel Foundation
-- Grants platform operators the ability to read across all organizations and usage events.

begin;

  -- 1. Policy for platform operators to read operational_usage_events globally
  drop policy if exists "platform operators can read all operational usage" on public.operational_usage_events;
  create policy "platform operators can read all operational usage"
  on public.operational_usage_events for select
  to authenticated
  using (private.is_platform_operator());

  -- 2. Policy for platform operators to manage whatsapp_rate_cards globally
  drop policy if exists "platform operators can manage whatsapp rate cards" on public.whatsapp_rate_cards;
  create policy "platform operators can manage whatsapp rate cards"
  on public.whatsapp_rate_cards for all
  to authenticated
  using (private.is_platform_operator())
  with check (private.is_platform_operator());

  -- 3. Policy for platform operators to read security incidents globally
  drop policy if exists "platform operators can read security incidents" on public.security_incidents;
  create policy "platform operators can read security incidents"
  on public.security_incidents for select
  to authenticated
  using (private.is_platform_operator());

  -- 4. Policy for platform operators to read automation recovery events globally
  drop policy if exists "platform operators can read automation recovery events" on public.automation_recovery_events;
  create policy "platform operators can read automation recovery events"
  on public.automation_recovery_events for select
  to authenticated
  using (private.is_platform_operator());

  -- 5. Helper RPC to get tenant overview for the OEM panel
  create or replace function public.admin_get_tenant_overview()
  returns table (
    organization_id uuid,
    organization_name text,
    business_category text,
    created_at timestamptz,
    plan_id text,
    status text,
    total_messages bigint,
    estimated_revenue_paise bigint
  )
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if not (select private.is_platform_operator()) then
      raise exception 'Unauthorized';
    end if;

    return query
    select
      o.id as organization_id,
      o.name as organization_name,
      o.extra->>'business_category' as business_category,
      o.created_at,
      e.plan_id,
      e.status,
      count(u.id) as total_messages,
      coalesce(sum(u.estimated_total_paise), 0)::bigint as estimated_revenue_paise
    from public.organizations o
    left join public.entitlements e on e.organization_id = o.id
    left join public.operational_usage_events u on u.organization_id = o.id
    group by o.id, o.name, o.extra, o.created_at, e.plan_id, e.status
    order by o.created_at desc;
  end;
  $$;

  revoke all on function public.admin_get_tenant_overview() from public, anon;
  grant execute on function public.admin_get_tenant_overview() to authenticated;

commit;
