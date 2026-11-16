import { cookies } from "next/headers";
import { cache } from "react";
import type { Snapshot } from "@/lib/catalog";
import type { CurrentUser } from "./auth";
import { asUser, getDb, type Sql } from "./db";

/** Signed-in reads run as the user, so RLS decides what comes back. */
export async function withUser<T>(uid: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await asUser(tx, uid);
    return fn(tx);
  });
}

/** Public reads run as Supabase's `anon` role: only published snapshots are visible. */
export async function withAnon<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return fn(tx);
  });
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ---------- public catalogue ----------
export interface Listing extends Snapshot { published_at: string }
const LISTING = "select data || jsonb_build_object('published_at', published_at) as d from publications";
const rowsToListings = (rows: { d: Listing }[]) => rows.map((r) => r.d);

export const listPublished = cache(async (): Promise<Listing[]> =>
  withAnon(async (tx) => rowsToListings((await tx.query<{ d: Listing }>(`${LISTING} order by published_at desc, name`)).rows)));

export const getPublished = cache(async (slug: string): Promise<Listing | null> =>
  withAnon(async (tx) => (await tx.query<{ d: Listing }>(`${LISTING} where slug = $1`, [slug])).rows[0]?.d ?? null));

export async function searchPublished(q: string): Promise<Listing[]> {
  const text = q.trim().slice(0, 100);
  if (!text) return [];
  return withAnon(async (tx) => rowsToListings((await tx.query<{ d: Listing }>(
    `${LISTING}, websearch_to_tsquery('english', $1) query
     where search @@ query or name ilike '%' || $2 || '%'
     order by ts_rank(search, query) desc, name limit 30`,
    [text, text.replace(/[\\%_]/g, (c) => `\\${c}`)])).rows));
}

// ---------- staff ----------
export type StaffRole = "admin" | "editor";
export const getStaffRole = cache(async (uid: string): Promise<StaffRole | null> =>
  withUser(uid, async (tx) => (await tx.query<{ r: StaffRole | null }>("select private.staff_role() as r")).rows[0]?.r ?? null));

export interface TitleRow {
  id: string; slug: string; kind: "movie" | "series"; name: string; synopsis: string; year: number | null; genres: string[];
  rating: string | null; accent: string; featured: boolean; asset_id: string | null; updated_at: Date;
  version: number | null; published_at: Date | null; episodes: number;
}
const TITLE_COLS = `t.id, t.slug, t.kind, t.name, t.synopsis, t.year, t.genres, t.rating, t.accent, t.featured, t.asset_id, t.updated_at,
  p.version, p.published_at, (select count(*)::int from episodes e where e.title_id = t.id) as episodes`;

export const listTitles = (uid: string) => withUser(uid, async (tx) =>
  (await tx.query<TitleRow>(`select ${TITLE_COLS} from titles t left join publications p on p.title_id = t.id order by t.updated_at desc`)).rows);

export interface EpisodeRow { id: string; season: number; number: number; name: string; synopsis: string; asset_id: string | null }
export async function getTitle(uid: string, id: string) {
  if (!isUuid(id)) return null;
  return withUser(uid, async (tx) => {
    const title = (await tx.query<TitleRow>(`select ${TITLE_COLS} from titles t left join publications p on p.title_id = t.id where t.id = $1`, [id])).rows[0];
    if (!title) return null;
    const episodes = (await tx.query<EpisodeRow>("select id, season, number, name, synopsis, asset_id from episodes where title_id = $1 order by season, number", [id])).rows;
    const issues = (await tx.query<{ i: string[] }>("select title_publish_issues($1) as i", [id])).rows[0]!.i;
    return { title, episodes, issues };
  });
}

export async function previewTitle(uid: string, id: string): Promise<Snapshot | null> {
  if (!isUuid(id)) return null;
  return withUser(uid, async (tx) => (await tx.query<{ s: Snapshot | null }>("select preview_title($1) as s", [id])).rows[0]?.s ?? null);
}

export interface AssetRow {
  id: string; label: string; video_url: string; duration_s: string | null; license: string; license_url: string | null;
  attribution: string; source_url: string; used_by: number;
}
export const listAssets = (uid: string) => withUser(uid, async (tx) => (await tx.query<AssetRow>(
  `select a.*, (select count(*)::int from titles t where t.asset_id = a.id) + (select count(*)::int from episodes e where e.asset_id = a.id) as used_by
   from media_assets a order by a.label`)).rows);

export const listStaff = (uid: string) => withUser(uid, async (tx) => (await tx.query<{ user_id: string; role: StaffRole; email: string; display_name: string }>(
  "select s.user_id, s.role, p.email, p.display_name from staff s join profiles p on p.id = s.user_id order by s.role, p.email")).rows);

export const listEvents = (uid: string) => withUser(uid, async (tx) => (await tx.query<{ id: number; title_id: string | null; title_name: string; action: string; actor: string | null; at: Date }>(
  `select e.id, e.title_id, e.title_name, e.action, coalesce(p.display_name, 'system') as actor, e.at
   from content_events e left join profiles p on p.id = e.actor order by e.at desc, e.id desc limit 200`)).rows);

// ---------- viewer profiles ----------
export const PROFILE_COOKIE = "so_profile";
export interface ViewerProfile { id: string; name: string; color: string }

export const listProfiles = cache(async (uid: string) => withUser(uid, async (tx) =>
  (await tx.query<ViewerProfile>("select id, name, color from viewer_profiles where user_id = $1 order by created_at", [uid])).rows));

/** The profile chosen in the cookie if it belongs to this account, else the account's first profile. */
export const getActiveProfile = cache(async (user: CurrentUser): Promise<ViewerProfile | null> => {
  const profiles = await listProfiles(user.id);
  const chosen = (await cookies()).get(PROFILE_COOKIE)?.value;
  return profiles.find((p) => p.id === chosen) ?? profiles[0] ?? null;
});

export interface ProgressRow { title_id: string; episode_id: string | null; position_s: number; duration_s: number | null; updated_at: Date }
const num = <T extends ProgressRow>(r: T) => ({ ...r, position_s: Number(r.position_s), duration_s: r.duration_s === null ? null : Number(r.duration_s) });

export async function titleProgress(uid: string, profileId: string, titleId: string) {
  return withUser(uid, async (tx) => (await tx.query<ProgressRow>(
    "select title_id, episode_id, position_s, duration_s, updated_at from playback_progress where profile_id = $1 and title_id = $2 order by updated_at desc",
    [profileId, titleId])).rows.map(num));
}

/** Recently watched, newest first, one entry per title (its latest movie/episode position). */
export async function recentlyWatched(uid: string, profileId: string, limit = 20) {
  return withUser(uid, async (tx) => (await tx.query<ProgressRow & { d: Listing }>(
    `select distinct on (pp.title_id) pp.title_id, pp.episode_id, pp.position_s, pp.duration_s, pp.updated_at,
            p.data || jsonb_build_object('published_at', p.published_at) as d
     from playback_progress pp join publications p on p.title_id = pp.title_id
     where pp.profile_id = $1 order by pp.title_id, pp.updated_at desc`, [profileId])).rows
    .map(num).sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, limit));
}

export async function watchlist(uid: string, profileId: string): Promise<Listing[]> {
  return withUser(uid, async (tx) => rowsToListings((await tx.query<{ d: Listing }>(
    `select p.data || jsonb_build_object('published_at', p.published_at) as d
     from watchlist w join publications p on p.title_id = w.title_id where w.profile_id = $1 order by w.added_at desc`, [profileId])).rows));
}

export async function inWatchlist(uid: string, profileId: string, titleId: string) {
  return withUser(uid, async (tx) => (await tx.query("select 1 from watchlist where profile_id = $1 and title_id = $2", [profileId, titleId])).rows.length > 0);
}
