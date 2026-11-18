-- Echo Map quota entitlements persistence.
-- Run this when ECHO_ENTITLEMENTS_STORE=supabase.

create table if not exists public.echo_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  period_key text not null default '',
  generation_used integer not null default 0,
  starter_generation_used integer not null default 0,
  landmark_count integer not null default 0,
  photo_count integer not null default 0,
  storage_bytes_used bigint not null default 0,
  extra_credits integer not null default 0,
  generation_unlimited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.echo_entitlements
  add column if not exists plan text not null default 'free';

alter table public.echo_entitlements
  add column if not exists period_key text not null default '';

alter table public.echo_entitlements
  add column if not exists generation_used integer not null default 0;

alter table public.echo_entitlements
  add column if not exists starter_generation_used integer not null default 0;

alter table public.echo_entitlements
  add column if not exists landmark_count integer not null default 0;

alter table public.echo_entitlements
  add column if not exists photo_count integer not null default 0;

alter table public.echo_entitlements
  add column if not exists storage_bytes_used bigint not null default 0;

alter table public.echo_entitlements
  add column if not exists extra_credits integer not null default 0;

alter table public.echo_entitlements
  add column if not exists generation_unlimited boolean not null default false;

alter table public.echo_entitlements
  add column if not exists created_at timestamptz not null default now();

alter table public.echo_entitlements
  add column if not exists updated_at timestamptz not null default now();

alter table public.echo_entitlements enable row level security;

drop policy if exists "echo_entitlements_select_own" on public.echo_entitlements;
create policy "echo_entitlements_select_own" on public.echo_entitlements
  for select using (auth.uid() = user_id);

-- Quota rows are written by the server with the service role key. Do not allow
-- client-side inserts or updates from the browser session.
