-- Persist the most recently purchased credit package for Balance UI.
-- Paid packages remain credit top-ups; this does not change the quota plan.

alter table public.echo_entitlements
  add column if not exists last_purchased_plan text;

alter table public.echo_entitlements
  drop constraint if exists echo_entitlements_last_purchased_plan_check;

alter table public.echo_entitlements
  add constraint echo_entitlements_last_purchased_plan_check
  check (last_purchased_plan is null or last_purchased_plan in ('plus', 'pro'));

update public.echo_entitlements as entitlement
   set last_purchased_plan = latest_order.plan_id
  from (
    select distinct on (user_id)
      user_id,
      plan_id
    from public.payment_orders
    where status = 'confirmed'
    order by user_id, coalesce(confirmed_at, updated_at, created_at) desc
  ) as latest_order
 where latest_order.user_id = entitlement.user_id
   and entitlement.last_purchased_plan is null;

create or replace function public.remember_purchased_plan_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text := new.metadata ->> 'plan_id';
begin
  if new.event_type = 'grant'
     and new.source = 'payment'
     and v_plan in ('plus', 'pro') then
    update public.echo_entitlements
       set last_purchased_plan = v_plan,
           updated_at = new.created_at
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists credit_ledger_remember_purchased_plan on public.credit_ledger;
create trigger credit_ledger_remember_purchased_plan
after insert on public.credit_ledger
for each row execute function public.remember_purchased_plan_from_ledger();

drop function if exists public.grant_extra_credits(uuid, integer, timestamptz);

create function public.grant_extra_credits(
  p_user_id uuid,
  p_credits integer,
  p_granted_at timestamptz default now(),
  p_plan_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entitlement public.echo_entitlements%rowtype;
  v_granted_at timestamptz := coalesce(p_granted_at, now());
begin
  if p_user_id is null or p_credits is null or p_credits <= 0 then
    raise exception 'userId and positive credits are required' using errcode = '22023';
  end if;
  if p_plan_id is not null and p_plan_id not in ('plus', 'pro') then
    raise exception 'planId must be plus or pro' using errcode = '22023';
  end if;

  insert into public.echo_entitlements (
    user_id,
    period_key,
    extra_credits,
    last_purchased_plan,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    to_char(v_granted_at at time zone 'UTC', 'YYYY-MM'),
    p_credits,
    p_plan_id,
    v_granted_at,
    v_granted_at
  )
  on conflict (user_id) do update
    set extra_credits = public.echo_entitlements.extra_credits + excluded.extra_credits,
        last_purchased_plan = coalesce(excluded.last_purchased_plan, public.echo_entitlements.last_purchased_plan),
        updated_at = excluded.updated_at
  returning * into v_entitlement;

  insert into public.credit_ledger (
    user_id,
    event_type,
    source,
    credits_delta,
    metadata,
    created_at
  )
  values (
    p_user_id,
    'admin_adjustment',
    'admin',
    p_credits,
    jsonb_build_object(
      'operation', 'grant_extra_credits',
      'plan_id', p_plan_id
    ),
    v_granted_at
  );

  return to_jsonb(v_entitlement);
end;
$$;

revoke all on function public.remember_purchased_plan_from_ledger()
  from public, anon, authenticated;
revoke all on function public.grant_extra_credits(uuid, integer, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.grant_extra_credits(uuid, integer, timestamptz, text)
  to service_role;
