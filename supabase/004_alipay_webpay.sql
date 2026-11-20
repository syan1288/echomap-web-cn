-- Alipay web checkout support. Apply after 003_payment_orders_and_credit_ledger.sql.

alter table public.payment_orders
  drop constraint if exists payment_orders_status_check,
  drop constraint if exists payment_orders_provider_check;

alter table public.payment_orders
  add constraint payment_orders_status_check check (
    status in (
      'pending_manual_confirmation',
      'pending_wechat_payment',
      'pending_alipay_payment',
      'confirmed'
    )
  );

alter table public.payment_orders
  add constraint payment_orders_provider_check check (
    provider in ('manual', 'wechat_native', 'alipay_page')
  );

create table if not exists public.alipay_payment_notifications (
  notify_id text primary key,
  payment_order_id text not null references public.payment_orders (id) on delete restrict,
  notify_type text not null,
  trade_status text not null,
  provider_transaction_id text not null,
  received_at timestamptz not null
);

alter table public.alipay_payment_notifications enable row level security;
revoke all on table public.alipay_payment_notifications from public, anon, authenticated;
grant select, insert on public.alipay_payment_notifications to service_role;

create or replace function public.confirm_alipay_payment_order(
  p_order_id text,
  p_amount_fen integer,
  p_provider_transaction_id text,
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
  v_confirmed_at timestamptz := coalesce(p_confirmed_at, now());
begin
  if nullif(trim(p_order_id), '') is null
     or p_amount_fen is null
     or v_transaction_id is null then
    raise exception 'orderId, amount, and transaction ID are required' using errcode = '22023';
  end if;

  select *
    into v_order
    from public.payment_orders
   where id = trim(p_order_id)
   for update;

  if not found or v_order.provider <> 'alipay_page' then
    raise exception 'Alipay payment order not found' using errcode = 'P0002';
  end if;
  if p_amount_fen <> round(v_order.amount_cny * 100)::integer then
    raise exception 'payment amount mismatch' using errcode = '22023';
  end if;

  if v_order.status = 'confirmed' then
    if v_order.provider_transaction_id is distinct from v_transaction_id then
      raise exception 'payment transaction mismatch' using errcode = '23505';
    end if;
    return to_jsonb(v_order);
  end if;
  if v_order.status <> 'pending_alipay_payment' then
    raise exception 'Alipay payment order cannot be confirmed from current status' using errcode = '22023';
  end if;

  update public.payment_orders
     set status = 'confirmed',
         confirmed_at = v_confirmed_at,
         provider_transaction_id = v_transaction_id,
         updated_at = v_confirmed_at
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
    to_char(v_confirmed_at at time zone 'UTC', 'YYYY-MM'),
    v_order.credits,
    v_confirmed_at,
    v_confirmed_at
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
      'provider_transaction_id', v_transaction_id
    ),
    v_confirmed_at
  );

  return to_jsonb(v_order);
end;
$$;

create or replace function public.process_alipay_payment_notification(
  p_order_id text,
  p_amount_fen integer,
  p_provider_transaction_id text,
  p_notify_id text,
  p_notify_type text,
  p_trade_status text,
  p_paid boolean,
  p_received_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.payment_orders%rowtype;
  v_previous public.alipay_payment_notifications%rowtype;
  v_duplicate boolean := false;
  v_received_at timestamptz := coalesce(p_received_at, now());
begin
  if nullif(trim(p_order_id), '') is null
     or p_amount_fen is null
     or nullif(trim(p_provider_transaction_id), '') is null
     or nullif(trim(p_notify_id), '') is null
     or nullif(trim(p_notify_type), '') is null
     or nullif(trim(p_trade_status), '') is null then
    raise exception 'Alipay notification is missing required fields' using errcode = '22023';
  end if;
  if p_paid is distinct from (p_trade_status in ('TRADE_SUCCESS', 'TRADE_FINISHED')) then
    raise exception 'Alipay notification trade status is inconsistent' using errcode = '22023';
  end if;

  select *
    into v_order
    from public.payment_orders
   where id = trim(p_order_id)
   for update;
  if not found or v_order.provider <> 'alipay_page' then
    raise exception 'Alipay payment order not found' using errcode = 'P0002';
  end if;
  if p_amount_fen <> round(v_order.amount_cny * 100)::integer then
    raise exception 'payment amount mismatch' using errcode = '22023';
  end if;

  select *
    into v_previous
    from public.alipay_payment_notifications
   where notify_id = trim(p_notify_id);
  if found then
    if v_previous.payment_order_id <> v_order.id
       or v_previous.provider_transaction_id <> trim(p_provider_transaction_id)
       or v_previous.trade_status <> trim(p_trade_status) then
      raise exception 'Alipay notification ID was reused with different data' using errcode = '23505';
    end if;
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true);
  end if;

  insert into public.alipay_payment_notifications (
    notify_id,
    payment_order_id,
    notify_type,
    trade_status,
    provider_transaction_id,
    received_at
  )
  values (
    trim(p_notify_id),
    v_order.id,
    trim(p_notify_type),
    trim(p_trade_status),
    trim(p_provider_transaction_id),
    v_received_at
  )
  on conflict (notify_id) do nothing;
  if not found then
    select *
      into v_previous
      from public.alipay_payment_notifications
     where notify_id = trim(p_notify_id);
    if v_previous.payment_order_id <> v_order.id
       or v_previous.provider_transaction_id <> trim(p_provider_transaction_id)
       or v_previous.trade_status <> trim(p_trade_status) then
      raise exception 'Alipay notification ID was reused with different data' using errcode = '23505';
    end if;
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true);
  end if;

  if p_paid then
    select *
      into v_order
      from jsonb_populate_record(
        null::public.payment_orders,
        public.confirm_alipay_payment_order(
          v_order.id,
          p_amount_fen,
          p_provider_transaction_id,
          v_received_at
        )
      );
  elsif v_order.status = 'confirmed'
        and v_order.provider_transaction_id is distinct from trim(p_provider_transaction_id) then
    raise exception 'payment transaction mismatch' using errcode = '23505';
  end if;

  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', v_duplicate);
end;
$$;

revoke all on function public.confirm_alipay_payment_order(text, integer, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.process_alipay_payment_notification(text, integer, text, text, text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_alipay_payment_order(text, integer, text, timestamptz)
  to service_role;
grant execute on function public.process_alipay_payment_notification(text, integer, text, text, text, text, boolean, timestamptz)
  to service_role;
