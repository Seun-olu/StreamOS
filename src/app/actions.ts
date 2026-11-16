"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext, slugify } from "@/lib/catalog";
import { checkCredentials, clearSession, createAccount, requireUser, setSession } from "@/server/auth";
import { asOwner, getDb, isEphemeralDemo } from "@/server/db";
import { getActiveProfile, isUuid, PROFILE_COOKIE, withUser } from "@/server/queries";

export type FormState = { error?: string; ok?: string } | undefined;

/** Turns database errors into messages safe to show; anything unexpected is logged and hidden. */
function errMsg(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  switch (err?.code) {
    case "42501":
      return err.message?.startsWith("Only ") ? err.message : "You don't have permission to do that";
    case "22023":
      return err.message ?? "Invalid request";
    case "23505":
      return "That slug or name is already taken";
    case "23503":
      return err.message === "Title is not available" ? err.message : "That item no longer exists";
    case "23514":
      return err.message && !err.message.includes("violates check constraint") ? err.message : "Some values are invalid";
  }
  console.error(e);
  return "Something went wrong";
}

const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0]!;
  return i.path.length ? `${String(i.path[0])}: ${i.message}` : i.message;
};

// ---------- auth ----------
const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  // Each serverless instance would have its own throwaway database, so accounts can't work reliably.
  if (isEphemeralDemo()) return { error: "Sign-in is switched off on this preview deployment until it is connected to a database." };
  const parsed = credentials.extend({ name: z.string().trim().min(1, "Name is required").max(80) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const id = await createAccount(await getDb(), parsed.data.email, parsed.data.password, parsed.data.name);
  if (!id) return { error: "An account with that email already exists" };
  await setSession(id);
  redirect(safeNext(form.get("next")));
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  // Each serverless instance would have its own throwaway database, so accounts can't work reliably.
  if (isEphemeralDemo()) return { error: "Sign-in is switched off on this preview deployment until it is connected to a database." };
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Email or password is incorrect" };
  const id = await checkCredentials(await getDb(), parsed.data.email, parsed.data.password);
  if (!id) return { error: "Email or password is incorrect" };
  await setSession(id);
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  await clearSession();
  (await cookies()).delete(PROFILE_COOKIE);
  redirect("/");
}

// ---------- viewer profiles ----------
const COLORS = ["#6366f1", "#e11d48", "#059669", "#d97706", "#0891b2"] as const;

export async function createProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = z.string().trim().min(1, "Name is required").max(40).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0]!.message };
  try {
    await withUser(user.id, async (tx) => {
      const n = (await tx.query<{ n: number }>("select count(*)::int as n from viewer_profiles where user_id = $1", [user.id])).rows[0]!.n;
      await tx.query("insert into viewer_profiles (user_id, name, color) values ($1, $2, $3)", [user.id, name.data, COLORS[n % COLORS.length]]);
    });
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/profiles");
  return { ok: "Profile created" };
}

export async function selectProfile(profileId: string) {
  const user = await requireUser();
  const owned = isUuid(profileId) && (await withUser(user.id, async (tx) =>
    (await tx.query("select 1 from viewer_profiles where id = $1", [profileId])).rows.length > 0));
  if (owned) (await cookies()).set(PROFILE_COOKIE, profileId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function deleteProfile(profileId: string): Promise<FormState> {
  const user = await requireUser();
  try {
    const left = await withUser(user.id, async (tx) => {
      const n = (await tx.query<{ n: number }>("select count(*)::int as n from viewer_profiles where user_id = $1", [user.id])).rows[0]!.n;
      if (n <= 1) return false;
      await tx.query("delete from viewer_profiles where id = $1", [profileId]);
      return true;
    });
    if (!left) return { error: "Keep at least one profile" };
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/profiles");
}

// ---------- watchlist & progress ----------
export async function toggleWatchlist(titleId: string, slug: string): Promise<FormState> {
  const user = await requireUser();
  const profile = await getActiveProfile(user);
  if (!profile || !isUuid(titleId)) return { error: "Choose a profile first" };
  try {
    await withUser(user.id, async (tx) => {
      const removed = await tx.query("delete from watchlist where profile_id = $1 and title_id = $2 returning 1", [profile.id, titleId]);
      if (!removed.rows.length) await tx.query("insert into watchlist (profile_id, title_id) values ($1, $2)", [profile.id, titleId]);
    });
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(`/title/${slug}`);
  revalidatePath("/my-list");
}

const progressInput = z.object({
  titleId: z.string().uuid(),
  episodeId: z.string().uuid().nullable(),
  position: z.number().finite().min(0).max(60 * 60 * 24),
  duration: z.number().finite().positive().max(60 * 60 * 24).nullable(),
});

/** Called by the player every few seconds and on pause/end. Last write wins. */
export async function saveProgress(input: z.input<typeof progressInput>): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = progressInput.safeParse(input);
  const profile = await getActiveProfile(user);
  if (!parsed.success || !profile) return { ok: false };
  const { titleId, episodeId, position, duration } = parsed.data;
  try {
    await withUser(user.id, (tx) => tx.query(
      `insert into playback_progress (profile_id, title_id, episode_id, position_s, duration_s) values ($1, $2, $3, $4, $5)
       on conflict (profile_id, title_id, episode_id)
       do update set position_s = excluded.position_s, duration_s = coalesce(excluded.duration_s, playback_progress.duration_s), updated_at = now()`,
      [profile.id, titleId, episodeId, Math.round(position * 10) / 10, duration]));
    return { ok: true };
  } catch (e) {
    errMsg(e);
    return { ok: false };
  }
}

// ---------- CMS ----------
const optionalText = (max: number) => z.string().trim().max(max).transform((s) => s || null);

const titleInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z.string().trim().max(80).optional().default(""),
  kind: z.enum(["movie", "series"]),
  synopsis: z.string().trim().max(2000).default(""),
  year: z.union([z.literal(""), z.coerce.number().int().min(1870).max(2100)]).transform((v) => (v === "" ? null : v)),
  genres: z.string().max(200).default("").transform((s) => [...new Set(s.split(",").map((g) => g.trim()).filter(Boolean))].slice(0, 6)),
  rating: optionalText(10),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour").transform((s) => s.toLowerCase()),
  featured: z.literal("on").optional().transform((v) => v === "on"),
  asset_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
});

export async function saveTitle(titleId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = titleInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const t = parsed.data;
  const slug = slugify(t.slug || t.name);
  if (!slug) return { error: "slug: use letters or numbers" };
  let id = titleId;
  try {
    id = await withUser(user.id, async (tx) => {
      const values = [slug, t.kind, t.name, t.synopsis, t.year, t.genres, t.rating, t.accent, t.featured, t.kind === "movie" ? t.asset_id : null];
      if (titleId) {
        const r = await tx.query<{ id: string }>(
          `update titles set slug = $1, kind = $2, name = $3, synopsis = $4, year = $5, genres = $6, rating = $7, accent = $8, featured = $9, asset_id = $10
           where id = $11 returning id`, [...values, titleId]);
        if (!r.rows[0]) throw Object.assign(new Error("not found"), { code: "42501" });
        return titleId;
      }
      return (await tx.query<{ id: string }>(
        `insert into titles (slug, kind, name, synopsis, year, genres, rating, accent, featured, asset_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`, [...values, user.id])).rows[0]!.id;
    });
  } catch (e) {
    return { error: errMsg(e) };
  }
  if (!titleId) redirect(`/admin/titles/${id}`);
  revalidatePath(`/admin/titles/${id}`);
  return { ok: "Draft saved" };
}

export async function deleteTitle(titleId: string): Promise<FormState> {
  const user = await requireUser();
  try {
    const n = await withUser(user.id, async (tx) => (await tx.query("delete from titles where id = $1 returning id", [titleId])).rows.length);
    if (!n) return { error: "Only admins can delete titles" };
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/", "layout");
  redirect("/admin");
}

const episodeInput = z.object({
  season: z.coerce.number().int().min(1).max(99),
  number: z.coerce.number().int().min(1).max(999),
  name: z.string().trim().min(1, "Episode name is required").max(120),
  synopsis: z.string().trim().max(2000).default(""),
  asset_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
});

export async function saveEpisode(titleId: string, episodeId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = episodeInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const e = parsed.data;
  try {
    await withUser(user.id, (tx) => episodeId
      ? tx.query("update episodes set season = $1, number = $2, name = $3, synopsis = $4, asset_id = $5 where id = $6 and title_id = $7",
          [e.season, e.number, e.name, e.synopsis, e.asset_id, episodeId, titleId])
      : tx.query("insert into episodes (title_id, season, number, name, synopsis, asset_id) values ($1, $2, $3, $4, $5, $6)",
          [titleId, e.season, e.number, e.name, e.synopsis, e.asset_id]));
  } catch (err) {
    const msg = errMsg(err);
    return { error: msg.startsWith("That slug") ? "That season/episode number is already used" : msg };
  }
  revalidatePath(`/admin/titles/${titleId}`);
  return { ok: episodeId ? "Episode saved" : "Episode added" };
}

export async function deleteEpisode(titleId: string, episodeId: string): Promise<FormState> {
  const user = await requireUser();
  try {
    await withUser(user.id, (tx) => tx.query("delete from episodes where id = $1 and title_id = $2", [episodeId, titleId]));
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(`/admin/titles/${titleId}`);
}

export async function publishTitle(titleId: string): Promise<FormState> {
  const user = await requireUser();
  let version: number;
  try {
    version = await withUser(user.id, async (tx) => (await tx.query<{ v: number }>("select publish_title($1) as v", [titleId])).rows[0]!.v);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/", "layout");
  return { ok: `Published version ${version}` };
}

export async function unpublishTitle(titleId: string): Promise<FormState> {
  const user = await requireUser();
  try {
    await withUser(user.id, (tx) => tx.query("select unpublish_title($1)", [titleId]));
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/", "layout");
  return { ok: "Unpublished" };
}

const assetInput = z.object({
  label: z.string().trim().min(1, "Label is required").max(120),
  video_url: z.string().trim().regex(/^(https:\/\/|\/)\S+$/, "Use an https:// URL or a /path"),
  duration_s: z.union([z.literal(""), z.coerce.number().positive().max(86400)]).transform((v) => (v === "" ? null : v)),
  license: z.string().trim().min(1, "Licence is required").max(120),
  license_url: z.union([z.literal(""), z.string().trim().regex(/^https:\/\/\S+$/, "Licence URL must be https://")]).transform((v) => v || null),
  attribution: z.string().trim().min(1, "Attribution is required").max(300),
  source_url: z.string().trim().regex(/^(https:\/\/|\/)\S+$/, "Source must be an https:// URL"),
});

export async function saveAsset(assetId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = assetInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const a = parsed.data;
  const values = [a.label, a.video_url, a.duration_s, a.license, a.license_url, a.attribution, a.source_url];
  try {
    await withUser(user.id, (tx) => assetId
      ? tx.query("update media_assets set label = $1, video_url = $2, duration_s = $3, license = $4, license_url = $5, attribution = $6, source_url = $7 where id = $8", [...values, assetId])
      : tx.query("insert into media_assets (label, video_url, duration_s, license, license_url, attribution, source_url, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)", [...values, user.id]));
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/admin/assets");
  return { ok: assetId ? "Asset saved" : "Asset added" };
}

export async function setStaffRole(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), role: z.enum(["admin", "editor", "none"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, role } = parsed.data;
  try {
    const msg = await withUser(user.id, async (tx) => {
      if (!(await tx.query<{ ok: boolean }>("select private.is_admin() as ok")).rows[0]!.ok) return "Only admins can manage staff";
      // Accounts outside staff aren't visible through RLS, so look the email up as the owner role.
      await asOwner(tx);
      const target = (await tx.query<{ id: string }>("select id from public.profiles where lower(email) = $1", [email])).rows[0];
      if (!target) return "No StreamOS account uses that email";
      await tx.exec("set local role authenticated");
      if (role === "none") await tx.query("delete from staff where user_id = $1", [target.id]);
      else await tx.query("insert into staff (user_id, role) values ($1, $2) on conflict (user_id) do update set role = excluded.role", [target.id, role]);
      return null;
    });
    if (msg) return { error: msg };
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/admin/staff");
  return { ok: role === "none" ? "Removed from staff" : `Role set to ${role}` };
}
