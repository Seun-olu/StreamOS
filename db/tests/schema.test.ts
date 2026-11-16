import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/server/db";
import { as, createUser, memoryDb } from "@/server/testing";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const EDITOR = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";
const SINTEL = "b0000000-0000-4000-8000-000000000001";
const SPRING = "b0000000-0000-4000-8000-000000000005";
const SERIES = "b0000000-0000-4000-8000-000000000004";
const TEST_ASSET = "a0000000-0000-4000-8000-000000000007";

const anon = <T>(db: Db, fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return fn(tx);
  });

let db: Db;
beforeEach(async () => {
  db = await memoryDb({ withSeed: true });
  await createUser(db, ADMIN, "admin@example.com");
  await createUser(db, EDITOR, "editor@example.com");
  await createUser(db, VIEWER, "viewer@example.com");
  await as(db, ADMIN, (tx) => tx.query("insert into staff (user_id, role) values ($1, 'editor')", [EDITOR]));
});

const profileOf = async (uid: string) =>
  (await as(db, uid, (tx) => tx.query<{ id: string }>("select id from viewer_profiles order by created_at limit 1"))).rows[0]!.id;

describe("accounts and roles", () => {
  test("first account is admin, later accounts are not staff; every account gets a viewer profile", async () => {
    const staff = await as(db, ADMIN, (tx) => tx.query<{ user_id: string; role: string }>("select user_id, role from staff order by role"));
    expect(staff.rows).toEqual([{ user_id: ADMIN, role: "admin" }, { user_id: EDITOR, role: "editor" }]);
    expect((await as(db, VIEWER, (tx) => tx.query("select * from staff"))).rows).toEqual([]);
    expect(await profileOf(VIEWER)).toBeTruthy();
  });

  test("viewers cannot grant themselves staff, and the last admin cannot be removed", async () => {
    await expect(as(db, VIEWER, (tx) => tx.query("insert into staff (user_id, role) values ($1, 'admin')", [VIEWER]))).rejects.toThrow(/row-level security/);
    await expect(as(db, ADMIN, (tx) => tx.query("delete from staff where user_id = $1", [ADMIN]))).rejects.toThrow(/at least one admin/);
  });

  test("an account can have at most 5 profiles and cannot see other accounts' profiles", async () => {
    await as(db, VIEWER, async (tx) => {
      for (let i = 2; i <= 5; i++) await tx.query("insert into viewer_profiles (user_id, name) values ($1, $2)", [VIEWER, `P${i}`]);
    });
    await expect(as(db, VIEWER, (tx) => tx.query("insert into viewer_profiles (user_id, name) values ($1, 'P6')", [VIEWER]))).rejects.toThrow(/at most 5/);
    expect((await as(db, ADMIN, (tx) => tx.query("select * from viewer_profiles where user_id = $1", [VIEWER]))).rows).toEqual([]);
    await expect(as(db, ADMIN, (tx) => tx.query("insert into viewer_profiles (user_id, name) values ($1, 'X')", [VIEWER]))).rejects.toThrow(/row-level security/);
  });
});

describe("CMS drafts and publishing", () => {
  test("anon sees only published snapshots, never drafts or assets", async () => {
    const pubs = await anon(db, (tx) => tx.query<{ slug: string }>("select slug from publications order by slug"));
    expect(pubs.rows.map((r) => r.slug)).toEqual(["big-buck-bunny", "sintel", "superman-1941", "tears-of-steel"]);
    await expect(anon(db, (tx) => tx.query("select * from titles"))).rejects.toThrow(/permission denied/);
    expect((await as(db, VIEWER, (tx) => tx.query("select * from titles"))).rows).toEqual([]);
    expect((await as(db, VIEWER, (tx) => tx.query("select * from media_assets"))).rows).toEqual([]);
  });

  test("editors draft and preview but cannot publish; admins publish", async () => {
    await as(db, EDITOR, (tx) => tx.query("update titles set asset_id = $2 where id = $1", [SPRING, TEST_ASSET]));
    const preview = await as(db, EDITOR, (tx) => tx.query<{ p: { name: string; video: { license: string } } }>("select preview_title($1) as p", [SPRING]));
    expect(preview.rows[0]!.p.video.license).toBe("CC0 1.0");
    await expect(as(db, EDITOR, (tx) => tx.query("select publish_title($1)", [SPRING]))).rejects.toThrow(/Only admins/);
    await expect(as(db, VIEWER, (tx) => tx.query("select preview_title($1)", [SPRING]))).rejects.toThrow(/Only staff/);
    const v = await as(db, ADMIN, (tx) => tx.query<{ v: number }>("select publish_title($1) as v", [SPRING]));
    expect(v.rows[0]!.v).toBe(1);
    expect((await anon(db, (tx) => tx.query("select 1 from publications where slug = 'spring'"))).rows).toHaveLength(1);
  });

  test("publishing validates the draft", async () => {
    const issues = await as(db, EDITOR, (tx) => tx.query<{ i: string[] }>("select title_publish_issues($1) as i", [SPRING]));
    expect(issues.rows[0]!.i).toEqual(["A movie needs a video asset"]);
    await expect(as(db, ADMIN, (tx) => tx.query("select publish_title($1)", [SPRING]))).rejects.toThrow(/Cannot publish: A movie needs a video asset/);
    await as(db, ADMIN, (tx) => tx.query("insert into episodes (title_id, number, name) values ($1, 4, 'No video yet')", [SERIES]));
    await expect(as(db, ADMIN, (tx) => tx.query("select publish_title($1)", [SERIES]))).rejects.toThrow(/Every episode needs a video asset/);
  });

  test("edits stay private until republished; unpublish hides the title", async () => {
    const before = await as(db, ADMIN, (tx) => tx.query<{ updated_at: Date }>("select updated_at from titles where id = $1", [SINTEL]));
    await as(db, EDITOR, (tx) => tx.query("update titles set name = 'Sintel (Director''s Cut)' where id = $1", [SINTEL]));
    const status = await as(db, ADMIN, (tx) => tx.query<{ changed: boolean }>(
      "select t.updated_at > p.published_at as changed from titles t join publications p on p.title_id = t.id where t.id = $1", [SINTEL]));
    expect(status.rows[0]!.changed).toBe(true);
    expect(before.rows[0]).toBeTruthy();
    const pub = () => anon(db, (tx) => tx.query<{ name: string; version: number }>("select name, version from publications where title_id = $1", [SINTEL]));
    expect((await pub()).rows[0]).toEqual({ name: "Sintel", version: 1 });
    await as(db, ADMIN, (tx) => tx.query("select publish_title($1)", [SINTEL]));
    expect((await pub()).rows[0]).toEqual({ name: "Sintel (Director's Cut)", version: 2 });
    await as(db, ADMIN, (tx) => tx.query("select unpublish_title($1)", [SINTEL]));
    expect((await pub()).rows).toEqual([]);
    const events = await as(db, EDITOR, (tx) => tx.query<{ action: string }>("select action from content_events where title_id = $1 order by id", [SINTEL]));
    expect(events.rows.map((r) => r.action)).toEqual(["created", "published", "published", "unpublished"]);
  });

  test("episode and asset edits mark the parent title as changed", async () => {
    await db.transaction(async (tx) => {
      await tx.exec("set local session_replication_role = replica"); // skip the touch trigger
      await tx.query("update titles set updated_at = now() - interval '1 day'");
    });
    await as(db, EDITOR, (tx) => tx.query("update media_assets set label = 'x' where id = 'a0000000-0000-4000-8000-000000000005'"));
    const r = await as(db, ADMIN, (tx) => tx.query<{ slug: string }>("select slug from titles where updated_at > now() - interval '1 hour'"));
    expect(r.rows.map((x) => x.slug)).toEqual(["superman-1941"]);
  });

  test("viewers cannot write publications or events directly", async () => {
    await expect(as(db, ADMIN, (tx) => tx.query("update publications set name = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(as(db, ADMIN, (tx) => tx.query("insert into content_events (title_name, action) values ('x', 'published')"))).rejects.toThrow(/permission denied/);
  });
});

describe("search", () => {
  test("full-text search covers name, synopsis, genres and episodes", async () => {
    const q = (text: string) => anon(db, (tx) => tx.query<{ slug: string }>(
      "select slug from publications where search @@ websearch_to_tsquery('english', $1) order by ts_rank(search, websearch_to_tsquery('english', $1)) desc, slug", [text]));
    expect((await q("dragon")).rows.map((r) => r.slug)).toEqual(["sintel"]);
    expect((await q("robots")).rows.map((r) => r.slug)).toEqual(["tears-of-steel", "superman-1941"]);
    expect((await q("earthquake")).rows.map((r) => r.slug)).toEqual(["superman-1941"]);
    expect((await q("animation -classic")).rows.map((r) => r.slug)).toEqual(["big-buck-bunny", "sintel"]);
    expect((await q("'); drop table titles; --")).rows).toEqual([]);
  });
});

describe("viewer data", () => {
  test("watchlist and progress are private to the owning account", async () => {
    const pid = await profileOf(VIEWER);
    await as(db, VIEWER, async (tx) => {
      await tx.query("insert into watchlist (profile_id, title_id) values ($1, $2)", [pid, SINTEL]);
      await tx.query("insert into playback_progress (profile_id, title_id, position_s, duration_s) values ($1, $2, 120, 888)", [pid, SINTEL]);
    });
    expect((await as(db, ADMIN, (tx) => tx.query("select * from watchlist"))).rows).toEqual([]);
    expect((await as(db, ADMIN, (tx) => tx.query("select * from playback_progress"))).rows).toEqual([]);
    await expect(as(db, ADMIN, (tx) => tx.query("insert into watchlist (profile_id, title_id) values ($1, $2)", [pid, SERIES]))).rejects.toThrow(/row-level security/);
  });

  test("progress upserts per movie and per episode (null episode is one row)", async () => {
    const pid = await profileOf(VIEWER);
    const ep = (await db.transaction((tx) => tx.query<{ id: string }>("select id from episodes where number = 2"))).rows[0]!.id;
    const save = (title: string, episode: string | null, pos: number) => as(db, VIEWER, (tx) => tx.query(
      `insert into playback_progress (profile_id, title_id, episode_id, position_s, duration_s) values ($1, $2, $3, $4, 600)
       on conflict (profile_id, title_id, episode_id) do update set position_s = excluded.position_s, updated_at = now()`, [pid, title, episode, pos]));
    await save(SINTEL, null, 10);
    await save(SINTEL, null, 50);
    await save(SERIES, ep, 30);
    const rows = await as(db, VIEWER, (tx) => tx.query<{ position_s: string }>("select position_s from playback_progress order by position_s"));
    expect(rows.rows.map((r) => Number(r.position_s))).toEqual([30, 50]);
  });

  test("viewer data can only reference published titles", async () => {
    const pid = await profileOf(VIEWER);
    await expect(as(db, VIEWER, (tx) => tx.query("insert into watchlist (profile_id, title_id) values ($1, $2)", [pid, SPRING]))).rejects.toThrow(/not available/);
  });
});
