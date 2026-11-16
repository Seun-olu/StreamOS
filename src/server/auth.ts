import { createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, isEphemeralDemo, type Db } from "./db";

/**
 * Local-mode authentication: users live in auth.users (the Supabase table, or
 * its stub under PGlite) with scrypt password hashes in private.local_credentials,
 * and sessions are HMAC-signed, httpOnly cookies. RLS identifies the user from
 * the same `sub` claim Supabase uses, so moving to Supabase Auth only replaces
 * this file.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "so_session";
const MAX_AGE_S = 60 * 60 * 24 * 7;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // A fixed fallback is only acceptable when the data itself is throwaway.
  if (process.env.NODE_ENV === "production" && !process.env.STREAMOS_LOCAL_DEMO && !isEphemeralDemo()) {
    throw new Error("SESSION_SECRET (32+ chars) is required in production");
  }
  return "streamos-local-development-secret-not-for-production";
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${(await scrypt(pw, salt, 32)).toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(pw, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(uid: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: now + MAX_AGE_S * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
    return typeof uid === "string" && exp > now ? uid : null;
  } catch {
    return null;
  }
}

export async function createAccount(db: Db, email: string, password: string, displayName: string): Promise<string | null> {
  const id = randomUUID();
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const exists = await tx.query("select 1 from auth.users where lower(email) = lower($1)", [email]);
    if (exists.rows.length) return null;
    await tx.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    await tx.query("insert into public.profiles (id, email, display_name) values ($1, $2, $3)", [id, email, displayName]);
    await tx.query("insert into private.local_credentials (user_id, password_hash) values ($1, $2)", [id, hash]);
    return id;
  });
}

export async function checkCredentials(db: Db, email: string, password: string): Promise<string | null> {
  const { rows } = await db.transaction((tx) =>
    tx.query<{ id: string; password_hash: string }>(
      "select u.id, c.password_hash from auth.users u join private.local_credentials c on c.user_id = u.id where lower(u.email) = lower($1)",
      [email],
    ),
  );
  const row = rows[0];
  if (!row) {
    await hashPassword(password); // similar timing for unknown emails
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? row.id : null;
}

export async function setSession(uid: string) {
  (await cookies()).set(SESSION_COOKIE, encodeSession(uid), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.STREAMOS_LOCAL_DEMO,
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const uid = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const db = await getDb();
  const { rows } = await db.transaction((tx) =>
    tx.query<{ id: string; email: string; display_name: string }>("select id, email, display_name from public.profiles where id = $1", [uid]),
  );
  const r = rows[0];
  return r ? { id: r.id, email: r.email, displayName: r.display_name } : null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
