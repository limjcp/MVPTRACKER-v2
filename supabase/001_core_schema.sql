-- Core Supabase schema for MVPTracker v2.
-- Apply in Supabase SQL editor (or via migration tooling).

-- Private helpers (keep security definer objects out of exposed schemas).
create schema if not exists app_private;

-- Helper to check admin role without granting broad table access.
create or replace function app_private.is_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_uid
      and ur.role = 'admin'
  );
$$;

revoke all on function app_private.is_admin(uuid) from public;
grant execute on function app_private.is_admin(uuid) to authenticated;

-- Roles (already referenced by desktop app).
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

drop policy if exists user_roles_select_own_or_admin on public.user_roles;
create policy user_roles_select_own_or_admin
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

-- Basic profile info (optional, but useful for admin overview).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists hourly_rate numeric;
alter table public.profiles add column if not exists currency text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_currency_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_currency_check
      check (currency is null or currency in ('USD', 'CAD', 'PHP'));
  end if;
end $$;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists profiles_upsert_own on public.profiles;
create policy profiles_upsert_own
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists profiles_upsert_admin on public.profiles;
create policy profiles_upsert_admin
on public.profiles
for insert
to authenticated
with check (app_private.is_admin(auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

-- Per-user settings that affect analytics.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  idle_threshold_minutes int not null default 2 check (idle_threshold_minutes between 0 and 240),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists user_settings_select_own_or_admin on public.user_settings;
create policy user_settings_select_own_or_admin
on public.user_settings
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists user_settings_upsert_own on public.user_settings;
create policy user_settings_upsert_own
on public.user_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
on public.user_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Presence / last seen (one row per user; desktop updates periodically).
create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_heartbeat_at timestamptz not null,
  last_active_at timestamptz,
  device_id text,
  app_version text,
  updated_at timestamptz not null default now()
);

create index if not exists user_presence_last_heartbeat_idx
on public.user_presence (last_heartbeat_at desc);

alter table public.user_presence enable row level security;

drop policy if exists user_presence_select_own_or_admin on public.user_presence;
create policy user_presence_select_own_or_admin
on public.user_presence
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists user_presence_upsert_own on public.user_presence;
create policy user_presence_upsert_own
on public.user_presence
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_presence_update_own on public.user_presence;
create policy user_presence_update_own
on public.user_presence
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Summary-only: keep raw tracker data local, only upload aggregates + current status.
create table if not exists public.user_current_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tracking_status text not null default 'idle' check (tracking_status in ('active', 'idle', 'away')),
  current_app text,
  current_project text,
  current_task_label text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_current_status enable row level security;

drop policy if exists user_current_status_select_own_or_admin on public.user_current_status;
create policy user_current_status_select_own_or_admin
on public.user_current_status
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists user_current_status_upsert_own on public.user_current_status;
create policy user_current_status_upsert_own
on public.user_current_status
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_current_status_update_own on public.user_current_status;
create policy user_current_status_update_own
on public.user_current_status
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

