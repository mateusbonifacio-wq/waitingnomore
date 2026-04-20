-- Waiting No More: initial Supabase schema for external users
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  overlay_while_generating boolean not null default true,
  default_session_mode text not null default 'play' check (default_session_mode in ('play', 'brain', 'focus')),
  show_session_summary boolean not null default true,
  play_intensity text not null default 'normal' check (play_intensity in ('chill', 'normal', 'intense')),
  trigger_when text not null default 'always' check (trigger_when in ('always', 'smart')),
  smart_trigger_min_generation_sec int not null default 3 check (smart_trigger_min_generation_sec between 1 and 30),
  theme_mode text not null default 'dark' check (theme_mode in ('light', 'dark')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.extension_installs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_source text not null default 'web',
  extension_detected boolean not null default false,
  extension_version text,
  browser_user_agent text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.idle_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  timestamp timestamptz not null,
  mode text not null check (mode in ('play', 'brain', 'focus')),
  total_hits int not null default 0,
  total_misses int not null default 0,
  duration_seconds numeric not null default 0,
  hits_per_second numeric not null default 0,
  average_reaction_ms numeric,
  generation_ended_successfully boolean not null default true,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_extension_installs_user_created_at on public.extension_installs(user_id, created_at desc);
create index if not exists idx_idle_sessions_user_timestamp on public.idle_sessions(user_id, timestamp desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
drop trigger if exists trg_idle_sessions_updated_at on public.idle_sessions;
create trigger trg_idle_sessions_updated_at before update on public.idle_sessions for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.extension_installs enable row level security;
alter table public.idle_sessions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
drop policy if exists "user_settings_upsert_own" on public.user_settings;
create policy "user_settings_upsert_own" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "extension_installs_select_own" on public.extension_installs;
create policy "extension_installs_select_own" on public.extension_installs for select using (auth.uid() = user_id);
drop policy if exists "extension_installs_insert_own" on public.extension_installs;
create policy "extension_installs_insert_own" on public.extension_installs for insert with check (auth.uid() = user_id);
drop policy if exists "extension_installs_update_own" on public.extension_installs;
create policy "extension_installs_update_own" on public.extension_installs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "idle_sessions_select_own" on public.idle_sessions;
create policy "idle_sessions_select_own" on public.idle_sessions for select using (auth.uid() = user_id);
drop policy if exists "idle_sessions_upsert_own" on public.idle_sessions;
create policy "idle_sessions_upsert_own" on public.idle_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
