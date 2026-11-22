-- Durable payment orders and credit history.
-- All writes are server-side; client roles intentionally receive no table policy.

create table if not exists public.payment_orders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  plan_id text not null check (plan_id in ('plus', 'pro')),
  plan_name text not null,
  amount_cny numeric(10, 2) not null check (amount_cny > 0),
  credits integer not null check (credits > 0),
  status text not null check (
    status in ('pending_manual_confirmation', 'pending_wechat_payment', 'confirmed')
  ),
  provider text not null check (provider in ('manual', 'wechat_native')),
  payment_url text not null default '',
  instructions text not null default '',
  contact text,
  confirmed_at timestamptz,
  provider_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'confirmed' and confirmed_at is not null)
    or status <> 'confirmed'
  )
);

create unique index if not exists payment_orders_provider_transaction_uidx
  on public.payment_orders (provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  payment_order_id text references public.payment_orders (id) on delete restrict,
  event_type text not null check (
    event_type in ('grant', 'consume', 'release', 'refund', 'admin_adjustment')
  ),
  source text not null check (
    source in ('payment', 'generation', 'admin', 'refund')
  ),
  credits_delta integer not null check (credits_delta <> 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists credit_ledger_payment_grant_uidx
  on public.credit_ledger (payment_order_id)
  where payment_order_id is not null and event_type = 'grant';

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

alter table public.payment_orders enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on table public.payment_orders from public, anon, authenticated;
revoke all on table public.credit_ledger from public, anon, authenticated;

grant select, insert, update on public.payment_orders to service_role;
grant select, insert on public.credit_ledger to service_role;

create or replace function public.confirm_payment_order(
  p_order_id text,
  p_amount_fen integer default null,
  p_provider_transaction_id text default null,
  p_confirmed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.payment_orders%rowtype;
  v_transaction_id text := nullif(trim(p_provider_transaction_id), '');
begin
  if nullif(trim(p_order_id), '') is null then
    raise exception 'orderId is required' using errcode = '22023';
  end if;

  select *
    into v_order
    from public.payment_orders
   where id = trim(p_order_id)
   for update;

  if not found then
    raise exception 'payment order not found' using errcode = 'P0002';
  end if;

  if p_amount_fen is not null
     and p_amount_fen <> round(v_order.amount_cny * 100)::integer then
    raise exception 'payment amount mismatch' using errcode = '22023';
  end if;

  if v_order.status = 'confirmed' then
    if v_transaction_id is not null
       and v_order.provider_transaction_id is not null
       and v_transaction_id <> v_order.provider_transaction_id then
      raise exception 'payment transaction mismatch' using errcode = '23505';
    end if;
    if v_transaction_id is not null and v_order.provider_transaction_id is null then
      update public.payment_orders
         set provider_transaction_id = v_transaction_id,
             updated_at = coalesce(p_confirmed_at, now())
       where id = v_order.id
       returning * into v_order;
    end if;
    return to_jsonb(v_order);
  end if;

  if v_order.status not in ('pending_manual_confirmation', 'pending_wechat_payment') then
    raise exception 'payment order cannot be confirmed from current status' using errcode = '22023';
  end if;

  update public.payment_orders
     set status = 'confirmed',
         confirmed_at = coalesce(p_confirmed_at, now()),
         provider_transaction_id = coalesce(v_transaction_id, provider_transaction_id),
         updated_at = coalesce(p_confirmed_at, now())
   where id = v_order.id
   returning * into v_order;

  insert into public.echo_entitlements (
    user_id,
    period_key,
    extra_credits,
    created_at,
    updated_at
  )
  values (
    v_order.user_id,
    to_char(coalesce(p_confirmed_at, now()) at time zone 'UTC', 'YYYY-MM'),
    v_order.credits,
    coalesce(p_confirmed_at, now()),
    coalesce(p_confirmed_at, now())
  )
  on conflict (user_id) do update
    set extra_credits = public.echo_entitlements.extra_credits + excluded.extra_credits,
        updated_at = excluded.updated_at;

  insert into public.credit_ledger (
    user_id,
    payment_order_id,
    event_type,
    source,
    credits_delta,
    metadata,
    created_at
  )
  values (
    v_order.user_id,
    v_order.id,
    'grant',
    'payment',
    v_order.credits,
    jsonb_build_object(
      'plan_id', v_order.plan_id,
      'amount_cny', v_order.amount_cny,
      'provider', v_order.provider,
      'provider_transaction_id', v_order.provider_transaction_id
    ),
    coalesce(p_confirmed_at, now())
  );

  return to_jsonb(v_order);
end;
$$;

create or replace function public.grant_extra_credits(
  p_user_id uuid,
  p_credits integer,
  p_granted_at timestamptz default now()
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

  insert into public.echo_entitlements (
    user_id,
    period_key,
    extra_credits,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    to_char(v_granted_at at time zone 'UTC', 'YYYY-MM'),
    p_credits,
    v_granted_at,
    v_granted_at
  )
  on conflict (user_id) do update
    set extra_credits = public.echo_entitlements.extra_credits + excluded.extra_credits,
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
    jsonb_build_object('operation', 'grant_extra_credits'),
    v_granted_at
  );

  return to_jsonb(v_entitlement);
end;
$$;

create or replace function public.consume_generation_entitlement(
  p_user_id uuid,
  p_free_starter_limit integer default 8,
  p_free_monthly_limit integer default 1,
  p_plus_monthly_limit integer default 20,
  p_pro_monthly_limit integer default 60,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.echo_entitlements%rowtype;
  v_now timestamptz := coalesce(p_now, now());
  v_period_key text;
  v_starter_limit integer;
  v_monthly_limit integer;
  v_period text;
  v_limit integer;
  v_used integer;
  v_remaining integer;
  v_bucket text;
begin
  if p_user_id is null
     or least(
       p_free_starter_limit,
       p_free_monthly_limit,
       p_plus_monthly_limit,
       p_pro_monthly_limit
     ) < 0 then
    raise exception 'userId and non-negative quota limits are required' using errcode = '22023';
  end if;

  v_period_key := to_char(v_now at time zone 'UTC', 'YYYY-MM');
  insert into public.echo_entitlements (user_id, period_key)
  values (p_user_id, v_period_key)
  on conflict (user_id) do nothing;

  select *
    into v_record
    from public.echo_entitlements
   where user_id = p_user_id
   for update;

  if v_record.period_key <> v_period_key then
    update public.echo_entitlements
       set period_key = v_period_key,
           generation_used = 0,
           updated_at = v_now
     where user_id = p_user_id
     returning * into v_record;
  end if;

  v_starter_limit := case when v_record.plan = 'free' then p_free_starter_limit else 0 end;
  v_monthly_limit := case v_record.plan
    when 'plus' then p_plus_monthly_limit
    when 'pro' then p_pro_monthly_limit
    else p_free_monthly_limit
  end;

  if v_record.starter_generation_used < v_starter_limit then
    v_period := 'starter';
    v_bucket := 'starter';
    v_limit := v_starter_limit;
    v_used := v_record.starter_generation_used + 1;
    v_remaining := v_limit - v_used;
    update public.echo_entitlements
       set starter_generation_used = v_used,
           updated_at = v_now
     where user_id = p_user_id;
  elsif v_record.generation_used < v_monthly_limit then
    v_period := v_period_key;
    v_bucket := 'monthly';
    v_limit := v_monthly_limit;
    v_used := v_record.generation_used + 1;
    v_remaining := v_limit - v_used;
    update public.echo_entitlements
       set generation_used = v_used,
           updated_at = v_now
     where user_id = p_user_id;
  elsif v_record.extra_credits > 0 then
    v_period := 'extra';
    v_bucket := 'extra';
    v_limit := v_record.extra_credits;
    v_used := 1;
    v_remaining := v_record.extra_credits - 1;
    update public.echo_entitlements
       set extra_credits = extra_credits - 1,
           updated_at = v_now
     where user_id = p_user_id;
  else
    return jsonb_build_object(
      'allowed', false,
      'plan', v_record.plan,
      'periodKey', v_period_key,
      'limit', v_monthly_limit,
      'used', v_record.generation_used,
      'remaining', 0,
      'reason', 'quota_exhausted'
    );
  end if;

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
    'consume',
    'generation',
    -1,
    jsonb_build_object('bucket', v_bucket),
    v_now
  );

  return jsonb_build_object(
    'allowed', true,
    'plan', v_record.plan,
    'periodKey', v_period,
    'limit', v_limit,
    'used', v_used,
    'remaining', v_remaining
  );
end;
$$;

revoke all on function public.confirm_payment_order(text, integer, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.grant_extra_credits(uuid, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.consume_generation_entitlement(uuid, integer, integer, integer, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.confirm_payment_order(text, integer, text, timestamptz)
  to service_role;
grant execute on function public.grant_extra_credits(uuid, integer, timestamptz)
  to service_role;
grant execute on function public.consume_generation_entitlement(uuid, integer, integer, integer, integer, timestamptz)
  to service_role;
