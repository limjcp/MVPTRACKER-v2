-- Rollup tables + recompute functions for Admin Overview charts.
-- Apply after 001_core_schema.sql

-- Daily per-user stats (fast range queries).
create table if not exists public.user_daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  total_seconds int not null default 0,
  productive_seconds int not null default 0,
  unproductive_seconds int not null default 0,
  idle_seconds int not null default 0,
  productivity_score int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.user_daily_stats enable row level security;

drop policy if exists user_daily_stats_select_own_or_admin on public.user_daily_stats;
create policy user_daily_stats_select_own_or_admin
on public.user_daily_stats
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists user_daily_stats_upsert_own on public.user_daily_stats;
create policy user_daily_stats_upsert_own
on public.user_daily_stats
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_daily_stats_update_own on public.user_daily_stats;
create policy user_daily_stats_update_own
on public.user_daily_stats
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Top apps per day.
create table if not exists public.user_app_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  app_name text not null,
  seconds int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, app_name)
);

alter table public.user_app_daily enable row level security;

drop policy if exists user_app_daily_select_own_or_admin on public.user_app_daily;
create policy user_app_daily_select_own_or_admin
on public.user_app_daily
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists user_app_daily_upsert_own on public.user_app_daily;
create policy user_app_daily_upsert_own
on public.user_app_daily
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_app_daily_update_own on public.user_app_daily;
create policy user_app_daily_update_own
on public.user_app_daily
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists user_app_daily_user_day_seconds_idx
on public.user_app_daily (user_id, day, seconds desc);

-- Top projects per day (summary-only; stores project name, not raw slices).
create table if not exists public.user_project_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  project_name text not null,
  seconds int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, project_name)
);

alter table public.user_project_daily enable row level security;

drop policy if exists user_project_daily_select_own_or_admin on public.user_project_daily;
create policy user_project_daily_select_own_or_admin
on public.user_project_daily
for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

drop policy if exists user_project_daily_upsert_own on public.user_project_daily;
create policy user_project_daily_upsert_own
on public.user_project_daily
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_project_daily_update_own on public.user_project_daily;
create policy user_project_daily_update_own
on public.user_project_daily
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists user_project_daily_user_day_seconds_idx
on public.user_project_daily (user_id, day, seconds desc);

