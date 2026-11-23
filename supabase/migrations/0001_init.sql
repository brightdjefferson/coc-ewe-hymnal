-- =====================================================================
-- COC Ewe Hymnal: database setup (Phase 1)
--
-- What this file does, in plain words:
--   * Creates the tables for collections, categories, hymns and verses.
--   * Creates an "admins" list: only emails on it can change hymns.
--   * Creates a change history so any edit can be undone.
--   * Creates an update counter that tells phones when hymns changed.
--   * Turns on security rules: everyone can READ published hymns;
--     only admins can add, edit, publish or delete.
--   * Adds the starting collections and categories (English names only;
--     the owner types the Ewe names in the admin site).
--
-- Run it ONCE, in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to read; it does not delete anything that already exists.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name_ee     text,
  name_en     text,
  sort_order  int not null default 0
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name_ee     text,
  name_en     text,
  sort_order  int not null default 0
);

create table public.hymns (
  id               uuid primary key default gen_random_uuid(),
  collection_id    uuid not null references public.collections(id),
  number           int not null check (number > 0),
  title_ee         text,
  title_en         text,
  search_keywords  text,
  source           text,
  rights_status    text not null default 'unknown'
                   check (rights_status in ('public_domain','permission_granted','original_work','unknown')),
  status           text not null default 'draft'
                   check (status in ('draft','published')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  unique (collection_id, number),
  check (coalesce(title_ee, '') <> '' or coalesce(title_en, '') <> '')
);

create table public.verses (
  id        uuid primary key default gen_random_uuid(),
  hymn_id   uuid not null references public.hymns(id) on delete cascade,
  lang      text not null check (lang in ('ee','en')),
  position  int not null,
  kind      text not null default 'verse'
            check (kind in ('verse','chorus','prechorus','refrain')),
  body      text not null,
  unique (hymn_id, lang, position)
);
create index verses_hymn_idx on public.verses(hymn_id);

create table public.hymn_categories (
  hymn_id      uuid references public.hymns(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete cascade,
  primary key (hymn_id, category_id)
);
create index hymn_categories_category_idx on public.hymn_categories(category_id);

create table public.content_version (
  id          int primary key default 1 check (id = 1),
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);
insert into public.content_version (id, version) values (1, 1);

-- People allowed to edit. Add someone with:
--   insert into public.admins (email) values ('person@example.com');
create table public.admins (
  email     text primary key check (email = lower(email)),
  added_at  timestamptz not null default now()
);

-- Every save, publish, unpublish, delete and restore is recorded here,
-- with a full copy of the hymn as it was after the change.
create table public.hymn_history (
  id                bigint generated always as identity primary key,
  hymn_id           uuid not null,          -- kept even if the hymn is deleted
  action            text not null check (action in ('create','edit','publish','unpublish','delete','restore')),
  snapshot          jsonb not null,
  changed_by        uuid,
  changed_by_email  text,
  changed_at        timestamptz not null default now()
);
create index hymn_history_hymn_idx on public.hymn_history(hymn_id, changed_at desc);

-- ---------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------

-- True when the signed-in person's email is on the admins list.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.bump_content_version()
returns void
language sql security definer
set search_path = ''
as $$
  update public.content_version set version = version + 1, updated_at = now() where id = 1;
$$;

-- A full copy of one hymn (row + verses + category ids) as JSON.
create or replace function public.hymn_snapshot(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select to_jsonb(h)
    || jsonb_build_object(
         'verses', coalesce((
           select jsonb_agg(jsonb_build_object('lang', v.lang, 'kind', v.kind, 'body', v.body)
                            order by v.lang, v.position)
           from public.verses v where v.hymn_id = h.id), '[]'::jsonb),
         'category_ids', coalesce((
           select jsonb_agg(hc.category_id) from public.hymn_categories hc where hc.hymn_id = h.id),
           '[]'::jsonb))
  from public.hymns h where h.id = p_id;
$$;

create or replace function public.require_admin()
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change hymns. Please log in with an admin account.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.log_hymn(p_id uuid, p_action text, p_snapshot jsonb default null)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.hymn_history (hymn_id, action, snapshot, changed_by, changed_by_email)
  values (p_id, p_action, coalesce(p_snapshot, public.hymn_snapshot(p_id)),
          auth.uid(), auth.jwt() ->> 'email');
$$;

-- Writes titles, verses, categories etc. from a JSON object onto a hymn,
-- creating the hymn (as a Draft) when p_create is true.
-- Used by save_hymn and restore_hymn. Does not change publish status.
create or replace function public.apply_hymn_content(p_id uuid, p jsonb, p_create boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_collection uuid := (p ->> 'collection_id')::uuid;
  v_number     int  := (p ->> 'number')::int;
begin
  perform public.require_admin();
  if v_collection is null then
    raise exception 'Please choose a collection.';
  end if;
  if v_number is null or v_number < 1 then
    raise exception 'Please enter a hymn number (1 or higher).';
  end if;
  if coalesce(trim(p ->> 'title_ee'), '') = '' and coalesce(trim(p ->> 'title_en'), '') = '' then
    raise exception 'Please enter an Ewe title or an English title.';
  end if;
  if coalesce(p ->> 'rights_status', 'unknown') not in ('public_domain','permission_granted','original_work','unknown') then
    raise exception 'Unknown rights status.';
  end if;
  if exists (select 1 from public.hymns
             where collection_id = v_collection and number = v_number and id <> p_id) then
    raise exception 'Hymn number % already exists in this collection.', v_number;
  end if;

  if p_create then
    insert into public.hymns (id, collection_id, number, title_en, status)
    values (p_id, v_collection, v_number, coalesce(nullif(trim(p ->> 'title_en'), ''), nullif(trim(p ->> 'title_ee'), '')), 'draft');
  end if;

  update public.hymns set
    collection_id   = v_collection,
    number          = v_number,
    title_ee        = nullif(trim(p ->> 'title_ee'), ''),
    title_en        = nullif(trim(p ->> 'title_en'), ''),
    search_keywords = nullif(trim(p ->> 'search_keywords'), ''),
    source          = nullif(trim(p ->> 'source'), ''),
    rights_status   = coalesce(p ->> 'rights_status', 'unknown'),
    updated_at      = now(),
    updated_by      = auth.uid()
  where id = p_id;

  delete from public.verses where hymn_id = p_id;
  insert into public.verses (hymn_id, lang, position, kind, body)
  select p_id,
         e.value ->> 'lang',
         row_number() over (partition by e.value ->> 'lang' order by e.ord),
         coalesce(e.value ->> 'kind', 'verse'),
         e.value ->> 'body'
  from jsonb_array_elements(coalesce(p -> 'verses', '[]'::jsonb)) with ordinality as e(value, ord)
  where coalesce(trim(e.value ->> 'body'), '') <> '';

  delete from public.hymn_categories where hymn_id = p_id;
  insert into public.hymn_categories (hymn_id, category_id)
  select distinct p_id, c.value::uuid
  from jsonb_array_elements_text(coalesce(p -> 'category_ids', '[]'::jsonb)) as c(value)
  where exists (select 1 from public.categories where id = c.value::uuid);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Actions the admin site calls
-- ---------------------------------------------------------------------

-- Create (no "id" given) or update a hymn. Returns the hymn's id.
create or replace function public.save_hymn(p jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_is_new boolean := false;
  v_status text;
begin
  perform public.require_admin();

  if v_id is null or not exists (select 1 from public.hymns where id = v_id) then
    v_is_new := true;
    v_id := coalesce(v_id, gen_random_uuid());
  end if;

  perform public.apply_hymn_content(v_id, p, v_is_new);
  perform public.log_hymn(v_id, case when v_is_new then 'create' else 'edit' end);

  select status into v_status from public.hymns where id = v_id;
  if v_status = 'published' then
    perform public.bump_content_version();
  end if;
  return v_id;
end;
$$;

create or replace function public.set_hymn_status(p_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_status not in ('draft','published') then
    raise exception 'Status must be draft or published.';
  end if;
  update public.hymns set status = p_status, updated_at = now(), updated_by = auth.uid()
  where id = p_id;
  if not found then
    raise exception 'That hymn no longer exists.';
  end if;
  perform public.log_hymn(p_id, case when p_status = 'published' then 'publish' else 'unpublish' end);
  perform public.bump_content_version();
end;
$$;

create or replace function public.delete_hymn(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb := public.hymn_snapshot(p_id);
begin
  perform public.require_admin();
  if v_snapshot is null then
    raise exception 'That hymn no longer exists.';
  end if;
  perform public.log_hymn(p_id, 'delete', v_snapshot);
  delete from public.hymns where id = p_id;
  if v_snapshot ->> 'status' = 'published' then
    perform public.bump_content_version();
  end if;
end;
$$;

-- Put a hymn back the way it was in one history entry.
-- Keeps the hymn's current Draft/Published status. A deleted hymn comes
-- back as a Draft.
create or replace function public.restore_hymn(p_history_id bigint)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_snap jsonb;
  v_id   uuid;
  v_status text;
begin
  perform public.require_admin();
  select hymn_id, snapshot into v_id, v_snap from public.hymn_history where id = p_history_id;
  if v_id is null then
    raise exception 'That history entry was not found.';
  end if;

  perform public.apply_hymn_content(v_id, v_snap,
    not exists (select 1 from public.hymns where id = v_id));
  perform public.log_hymn(v_id, 'restore');

  select status into v_status from public.hymns where id = v_id;
  if v_status = 'published' then
    perform public.bump_content_version();
  end if;
  return v_id;
end;
$$;

-- Readers' phones also need to refresh when collection or category
-- names change.
create or replace function public.bump_on_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.bump_content_version();
  return null;
end;
$$;
create trigger collections_bump after insert or update or delete on public.collections
  for each statement execute function public.bump_on_change();
create trigger categories_bump after insert or update or delete on public.categories
  for each statement execute function public.bump_on_change();

-- ---------------------------------------------------------------------
-- 4. Security rules (row-level security)
-- ---------------------------------------------------------------------

alter table public.collections     enable row level security;
alter table public.categories      enable row level security;
alter table public.hymns           enable row level security;
alter table public.verses          enable row level security;
alter table public.hymn_categories enable row level security;
alter table public.content_version enable row level security;
alter table public.admins          enable row level security;
alter table public.hymn_history    enable row level security;

-- Everyone may read collections, categories and the update counter.
create policy "read collections" on public.collections for select using (true);
create policy "read categories"  on public.categories  for select using (true);
create policy "read version"     on public.content_version for select using (true);

-- Admins may manage collections and categories directly.
create policy "admins manage collections" on public.collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Hymns: everyone sees published ones; admins also see drafts.
create policy "read published hymns" on public.hymns
  for select using (status = 'published' or public.is_admin());

create policy "read verses of visible hymns" on public.verses
  for select using (exists (
    select 1 from public.hymns h
    where h.id = verses.hymn_id and (h.status = 'published' or public.is_admin())));

create policy "read categories of visible hymns" on public.hymn_categories
  for select using (exists (
    select 1 from public.hymns h
    where h.id = hymn_categories.hymn_id and (h.status = 'published' or public.is_admin())));

-- Hymns, verses and their categories are changed only through the
-- save/publish/delete/restore functions above, so every change is
-- recorded in the history. (No insert/update/delete policies on purpose.)

create policy "admins read admins"  on public.admins       for select to authenticated using (public.is_admin());
create policy "admins read history" on public.hymn_history for select to authenticated using (public.is_admin());

-- Table permissions (row-level security above still applies).
grant select on public.collections, public.categories, public.hymns, public.verses,
                public.hymn_categories, public.content_version
  to anon, authenticated;
grant insert, update, delete on public.collections, public.categories to authenticated;
grant select on public.admins, public.hymn_history to authenticated;
revoke insert, update, delete on public.hymns, public.verses, public.hymn_categories,
                                 public.content_version, public.admins, public.hymn_history
  from anon, authenticated;

-- Function permissions: only signed-in users can call the actions
-- (and the actions themselves check for admin).
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.save_hymn(jsonb),
                          public.set_hymn_status(uuid, text),
                          public.delete_hymn(uuid),
                          public.restore_hymn(bigint)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. Starting data (English names; Ewe names to be added by the owner)
-- ---------------------------------------------------------------------

insert into public.collections (slug, name_en, sort_order) values
  ('hymns',         'Hymns',         1),
  ('choruses',      'Choruses',      2),
  ('praises',       'Praises',       3),
  ('english-hymns', 'English Hymns', 4);

insert into public.categories (slug, name_en, sort_order) values
  ('worship',      'Worship',       1),
  ('lords-supper', 'Lord''s Supper', 2),
  ('baptism',      'Baptism',       3),
  ('invitation',   'Invitation',    4),
  ('prayer',       'Prayer',        5),
  ('thanksgiving', 'Thanksgiving',  6),
  ('evening',      'Evening',       7),
  ('funerals',     'Funerals',      8);
