-- StreamOS schema. Supabase-compatible: auth.users / auth.uid(), anon and
-- authenticated roles, RLS on every exposed table, helpers in `private`.
--
-- Content model: staff edit drafts in titles / episodes / media_assets (never
-- readable by the public). Publishing snapshots a title into `publications`,
-- the only content table anon can read. Edits after publishing stay invisible
-- until the title is republished.

create schema if not exists private;

create type public.staff_role as enum ('admin', 'editor');
create type public.title_kind as enum ('movie', 'series');

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table private.local_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  password_hash text not null
);

create table public.staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now()
);

create table public.viewer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- role helpers (not exposed through the API) ----------
create function private.staff_role() returns public.staff_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.staff where user_id = auth.uid()
$$;
create function private.is_staff() returns boolean language sql stable as $$ select private.staff_role() is not null $$;
create function private.is_admin() returns boolean language sql stable as $$ select private.staff_role() = 'admin' $$;
create function private.owns_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.viewer_profiles where id = pid and user_id = auth.uid())
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.staff_role(), private.is_staff(), private.is_admin(), private.owns_profile(uuid) to anon, authenticated;

-- New account: default viewer profile; the very first account becomes admin.
create function private.on_profile_created() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.viewer_profiles (user_id, name) values (new.id, left(new.display_name, 40));
  perform pg_advisory_xact_lock(hashtext('streamos.first_admin'));
  if not exists (select 1 from public.staff) then
    insert into public.staff (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger profiles_created after insert on public.profiles for each row execute function private.on_profile_created();

create function private.limit_viewer_profiles() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.viewer_profiles where user_id = new.user_id) >= 5 then
    raise exception 'An account can have at most 5 profiles' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger viewer_profiles_limit before insert on public.viewer_profiles for each row execute function private.limit_viewer_profiles();

create function private.keep_one_admin() returns trigger language plpgsql as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.profiles where id = old.user_id)
     and not exists (select 1 from public.staff where role = 'admin' and user_id <> old.user_id) then
    raise exception 'There must be at least one admin' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger staff_keep_admin before update or delete on public.staff for each row execute function private.keep_one_admin();

-- ---------- content (drafts) ----------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 120),
  -- Hosted https URL, or a same-origin path (used for the bundled test clip).
  video_url text not null check (video_url ~ '^(https://|/)[^\s]+$'),
  duration_s numeric check (duration_s > 0),
  license text not null check (length(license) between 1 and 120),
  license_url text check (license_url ~ '^https://'),
  attribution text not null check (length(attribution) between 1 and 300),
  source_url text not null check (source_url ~ '^(https://|/)'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.titles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  kind public.title_kind not null,
  name text not null check (length(name) between 1 and 120),
  synopsis text not null default '' check (length(synopsis) <= 2000),
  year int check (year between 1870 and 2100),
  genres text[] not null default '{}' check (cardinality(genres) <= 6),
  rating text check (length(rating) <= 10),
  accent text not null default '#4f46e5' check (accent ~ '^#[0-9a-f]{6}$'),
  featured boolean not null default false,
  asset_id uuid references public.media_assets (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles (id) on delete cascade,
  season int not null default 1 check (season between 1 and 99),
  number int not null check (number between 1 and 999),
  name text not null check (length(name) between 1 and 120),
  synopsis text not null default '' check (length(synopsis) <= 2000),
  asset_id uuid references public.media_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_id, season, number)
);
create index episodes_title on public.episodes (title_id);

-- Any change to a title's episodes or assets marks the title as changed since publish.
create function private.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger titles_touch before update on public.titles for each row execute function private.touch();
create trigger episodes_touch before update on public.episodes for each row execute function private.touch();
create trigger assets_touch before update on public.media_assets for each row execute function private.touch();

create function private.touch_parent_title() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'episodes' then
    update public.titles set updated_at = now() where id = coalesce(new.title_id, old.title_id);
  else
    update public.titles set updated_at = now()
     where asset_id = new.id or id in (select title_id from public.episodes where asset_id = new.id);
  end if;
  return null;
end $$;
create trigger episodes_touch_title after insert or update or delete on public.episodes for each row execute function private.touch_parent_title();
create trigger assets_touch_titles after update on public.media_assets for each row execute function private.touch_parent_title();

-- ---------- published snapshots (public) ----------
create table public.publications (
  title_id uuid primary key references public.titles (id) on delete cascade,
  slug text not null unique,
  kind public.title_kind not null,
  name text not null,
  synopsis text not null,
  search_extra text not null default '',
  featured boolean not null default false,
  data jsonb not null,
  version int not null default 1,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  search tsvector generated always as (
    setweight(to_tsvector('english', name), 'A') ||
    setweight(to_tsvector('english', synopsis), 'B') ||
    setweight(to_tsvector('english', search_extra), 'C')
  ) stored
);
create index publications_search on public.publications using gin (search);
create index publications_recent on public.publications (published_at desc);

create table public.content_events (
  id bigint generated always as identity primary key,
  title_id uuid,
  title_name text not null,
  action text not null check (action in ('created', 'published', 'unpublished', 'deleted')),
  actor uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);
create index content_events_at on public.content_events (at desc);

create function private.log_title() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.content_events (title_id, title_name, action, actor)
  values (case when tg_op = 'DELETE' then null else new.id end, coalesce(new.name, old.name),
          case when tg_op = 'DELETE' then 'deleted' else 'created' end, auth.uid());
  return null;
end $$;
create trigger titles_log after insert or delete on public.titles for each row execute function private.log_title();

-- The snapshot shape is the contract between the CMS and the public site.
create function private.title_snapshot(tid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'kind', t.kind, 'name', t.name, 'synopsis', t.synopsis,
    'year', t.year, 'genres', to_jsonb(t.genres), 'rating', t.rating, 'accent', t.accent, 'featured', t.featured,
    'video', case when a.id is null then null else jsonb_build_object(
      'url', a.video_url, 'duration_s', a.duration_s, 'license', a.license, 'license_url', a.license_url,
      'attribution', a.attribution, 'source_url', a.source_url) end,
    'episodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'season', e.season, 'number', e.number, 'name', e.name, 'synopsis', e.synopsis,
        'video', case when ea.id is null then null else jsonb_build_object(
          'url', ea.video_url, 'duration_s', ea.duration_s, 'license', ea.license, 'license_url', ea.license_url,
          'attribution', ea.attribution, 'source_url', ea.source_url) end
      ) order by e.season, e.number)
      from public.episodes e left join public.media_assets ea on ea.id = e.asset_id
      where e.title_id = t.id), '[]'::jsonb))
  from public.titles t left join public.media_assets a on a.id = t.asset_id
  where t.id = tid
$$;

create function private.publish_issues(snap jsonb) returns text[] language sql immutable as $$
  select array_remove(array[
    case when length(trim(snap->>'synopsis')) = 0 then 'Add a synopsis' end,
    case when snap->>'kind' = 'movie' and snap->'video' = 'null'::jsonb then 'A movie needs a video asset' end,
    case when snap->>'kind' = 'series' and jsonb_array_length(snap->'episodes') = 0 then 'A series needs at least one episode' end,
    case when snap->>'kind' = 'series' and exists (
      select 1 from jsonb_array_elements(snap->'episodes') ep where ep->'video' = 'null'::jsonb)
      then 'Every episode needs a video asset' end
  ], null)
$$;

create function private.do_publish(tid uuid, actor uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  snap jsonb := private.title_snapshot(tid);
  issues text[];
  v int;
begin
  if snap is null then raise exception 'Title not found' using errcode = 'P0002'; end if;
  issues := private.publish_issues(snap);
  if cardinality(issues) > 0 then
    raise exception 'Cannot publish: %', array_to_string(issues, '; ') using errcode = '22023';
  end if;
  insert into public.publications as p (title_id, slug, kind, name, synopsis, search_extra, featured, data, published_by)
  values (tid, snap->>'slug', (snap->>'kind')::public.title_kind, snap->>'name', snap->>'synopsis',
          concat_ws(' ', (select string_agg(g, ' ') from jsonb_array_elements_text(snap->'genres') g),
                         (select string_agg(concat_ws(' ', ep->>'name', ep->>'synopsis'), ' ') from jsonb_array_elements(snap->'episodes') ep)),
          (snap->>'featured')::boolean, snap, actor)
  on conflict (title_id) do update set
    slug = excluded.slug, kind = excluded.kind, name = excluded.name, synopsis = excluded.synopsis,
    search_extra = excluded.search_extra, featured = excluded.featured, data = excluded.data,
    published_by = excluded.published_by, published_at = now(), version = p.version + 1
  returning version into v;
  insert into public.content_events (title_id, title_name, action, actor) values (tid, snap->>'name', 'published', actor);
  return v;
end $$;

-- RPC surface (callable by signed-in users; role checked inside).
create function public.publish_title(tid uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.is_admin() then raise exception 'Only admins can publish' using errcode = '42501'; end if;
  return private.do_publish(tid, auth.uid());
end $$;

create function public.unpublish_title(tid uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare n text;
begin
  if not private.is_admin() then raise exception 'Only admins can unpublish' using errcode = '42501'; end if;
  delete from public.publications where title_id = tid returning name into n;
  if n is null then return false; end if;
  insert into public.content_events (title_id, title_name, action, actor) values (tid, n, 'unpublished', auth.uid());
  return true;
end $$;

create function public.preview_title(tid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.is_staff() then raise exception 'Only staff can preview drafts' using errcode = '42501'; end if;
  return private.title_snapshot(tid);
end $$;

create function public.title_publish_issues(tid uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.is_staff() then raise exception 'Only staff can see drafts' using errcode = '42501'; end if;
  return private.publish_issues(private.title_snapshot(tid));
end $$;

revoke execute on function public.publish_title(uuid), public.unpublish_title(uuid),
  public.preview_title(uuid), public.title_publish_issues(uuid) from public, anon;
grant execute on function public.publish_title(uuid), public.unpublish_title(uuid),
  public.preview_title(uuid), public.title_publish_issues(uuid) to authenticated;

-- ---------- viewer data ----------
create table public.watchlist (
  profile_id uuid not null references public.viewer_profiles (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (profile_id, title_id)
);

create table public.playback_progress (
  profile_id uuid not null references public.viewer_profiles (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete cascade,
  position_s numeric not null check (position_s >= 0),
  duration_s numeric check (duration_s > 0),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (profile_id, title_id, episode_id)
);
create index progress_recent on public.playback_progress (profile_id, updated_at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.viewer_profiles enable row level security;
alter table public.media_assets enable row level security;
alter table public.titles enable row level security;
alter table public.episodes enable row level security;
alter table public.publications enable row level security;
alter table public.content_events enable row level security;
alter table public.watchlist enable row level security;
alter table public.playback_progress enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy staff_read on public.staff for select to authenticated using (user_id = auth.uid() or private.is_admin());
create policy staff_write on public.staff for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy vp_own on public.viewer_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy assets_read on public.media_assets for select to authenticated using (private.is_staff());
create policy assets_insert on public.media_assets for insert to authenticated with check (private.is_staff());
create policy assets_update on public.media_assets for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy assets_delete on public.media_assets for delete to authenticated using (private.is_admin());

create policy titles_read on public.titles for select to authenticated using (private.is_staff());
create policy titles_insert on public.titles for insert to authenticated with check (private.is_staff());
create policy titles_update on public.titles for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy titles_delete on public.titles for delete to authenticated using (private.is_admin());

create policy episodes_read on public.episodes for select to authenticated using (private.is_staff());
create policy episodes_insert on public.episodes for insert to authenticated with check (private.is_staff());
create policy episodes_update on public.episodes for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy episodes_delete on public.episodes for delete to authenticated using (private.is_staff());

create policy publications_read on public.publications for select to anon, authenticated using (true);
revoke insert, update, delete on public.publications from anon, authenticated;

create policy events_read on public.content_events for select to authenticated using (private.is_staff());
revoke insert, update, delete on public.content_events from anon, authenticated;

create policy watchlist_own on public.watchlist for all to authenticated
  using (private.owns_profile(profile_id)) with check (private.owns_profile(profile_id));
create policy progress_own on public.playback_progress for all to authenticated
  using (private.owns_profile(profile_id)) with check (private.owns_profile(profile_id));

-- Viewer data can only point at published titles.
create function private.require_published() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.publications where title_id = new.title_id) then
    raise exception 'Title is not available' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger watchlist_published before insert on public.watchlist for each row execute function private.require_published();
create trigger progress_published before insert or update on public.playback_progress for each row execute function private.require_published();

revoke all on public.staff, public.viewer_profiles, public.media_assets, public.titles, public.episodes,
  public.watchlist, public.playback_progress from anon;
