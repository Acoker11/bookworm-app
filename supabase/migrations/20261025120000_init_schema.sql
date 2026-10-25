-- profiles --------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- library_items ---------------------------------------------------------
create table public.library_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  volume_id  text not null check (char_length(volume_id) between 1 and 64),
  status     text not null default 'want to read'
             check (status in ('want to read', 'reading', 'finished')),
  created_at timestamptz not null default now(),
  unique (user_id, volume_id)            -- also the composite FK target
);
alter table public.library_items enable row level security;
revoke all on public.library_items from anon;

-- logs ------------------------------------------------------------------
create table public.logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  volume_id  text not null,
  body       text not null check (char_length(btrim(body)) between 1 and 5000),
  rating     smallint check (rating between 1 and 5),   -- optional
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, volume_id)
    references public.library_items (user_id, volume_id) on delete cascade
);
alter table public.logs enable row level security;

create index logs_volume_created_idx on public.logs (volume_id, created_at desc);
create index logs_user_volume_idx on public.logs (user_id, volume_id);

-- keep logs.updated_at current ------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger logs_set_updated_at
  before update on public.logs
  for each row execute function public.set_updated_at();

-- auto-create profile on signup (display name from signup metadata) -----
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 50), ''), 'Reader')
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- policies --------------------------------------------------------------
-- profiles
create policy "profiles are publicly readable"
  on public.profiles for select to anon, authenticated using (true);
create policy "users update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- library_items (owner only; no anon access at all)
create policy "owner selects library"
  on public.library_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "owner inserts library"
  on public.library_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "owner updates library"
  on public.library_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner deletes library"
  on public.library_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- logs (public read, owner write)
create policy "logs are publicly readable"
  on public.logs for select to anon, authenticated using (true);
create policy "owner inserts logs"
  on public.logs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "owner updates logs"
  on public.logs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner deletes logs"
  on public.logs for delete to authenticated
  using ((select auth.uid()) = user_id);
