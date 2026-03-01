-- Farscry initial schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Enable the trigram extension for fuzzy display_name search
create extension if not exists pg_trgm;

-- ============================================
-- TABLES
-- ============================================

-- User profiles (synced from auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contacts
create table if not exists public.contacts (
  user_id uuid not null references public.users(id) on delete cascade,
  contact_user_id uuid not null references public.users(id) on delete cascade,
  is_favorite boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (user_id, contact_user_id),
  constraint no_self_contact check (user_id != contact_user_id)
);

-- Push notification tokens
create table if not exists public.push_tokens (
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  voip_token text,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

-- ============================================
-- INDEXES
-- ============================================

create index if not exists idx_contacts_contact_user on public.contacts(contact_user_id);
create index if not exists idx_contacts_user on public.contacts(user_id);
create index if not exists idx_users_display_name on public.users using gin (display_name gin_trgm_ops);

-- ============================================
-- TRIGGER: Auto-create user profile on signup
-- ============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

-- Drop trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.users enable row level security;
alter table public.contacts enable row level security;
alter table public.push_tokens enable row level security;

-- Users: anyone authenticated can read profiles (for search/contacts)
create policy "Users can read all profiles"
  on public.users for select
  to authenticated
  using (true);

-- Users: can only update own profile
create policy "Users can update own profile"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users: can delete own profile
create policy "Users can delete own profile"
  on public.users for delete
  to authenticated
  using (auth.uid() = id);

-- Contacts: can read own contacts
create policy "Users can read own contacts"
  on public.contacts for select
  to authenticated
  using (auth.uid() = user_id);

-- Contacts: can insert own contacts
create policy "Users can add contacts"
  on public.contacts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Contacts: can update own contacts (favorite toggle)
create policy "Users can update own contacts"
  on public.contacts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Contacts: can delete own contacts
create policy "Users can remove contacts"
  on public.contacts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Push tokens: full access to own tokens only
create policy "Users can manage own push tokens"
  on public.push_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
