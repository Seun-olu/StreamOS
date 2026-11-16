import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Minimal SQL surface shared by PGlite (local/tests) and postgres.js (hosted Postgres). */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
}
export interface Db {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

/** Run the rest of the transaction as a signed-in Supabase user: RLS applies. */
export async function asUser(tx: Sql, uid: string) {
  await tx.exec("set local role authenticated");
  await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}

/** Back to the table owner (RLS bypassed) for engine writes; auth.uid() still identifies the actor. */
export async function asOwner(tx: Sql) {
  await tx.exec("reset role");
}

const DB_DIR = join(process.cwd(), "db");

/** Hosted Postgres URL: DATABASE_URL, or the one Netlify DB (Neon) injects. */
export const hostedDatabaseUrl = () => process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || "";

/**
 * True on a serverless host (Netlify/AWS Lambda) with no hosted database: the
 * embedded database then lives in /tmp and is wiped whenever the function
 * restarts. The UI shows a "demo data resets" notice in this mode.
 */
export const isEphemeralDemo = () =>
  !hostedDatabaseUrl() && !!(process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

export function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(join(DB_DIR, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(DB_DIR, "migrations", name), "utf8") }));
}

/** Applies pending migrations (and, for PGlite, the Supabase auth stub). */
export async function migrate(db: Db, { withStub }: { withStub: boolean }) {
  await db.transaction(async (tx) => {
    // Several cold-starting instances may migrate at once; serialise them.
    await tx.query("select pg_advisory_xact_lock(hashtext('streamos.migrate'))");
    if (withStub) {
      const { rows } = await tx.query<{ ok: boolean }>("select exists (select 1 from pg_namespace where nspname = 'auth') as ok");
      if (!rows[0]!.ok) await tx.exec(readFileSync(join(DB_DIR, "supabase-stub.sql"), "utf8"));
    }
    await tx.exec("create schema if not exists private; create table if not exists private.migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await tx.query<{ name: string }>("select name from private.migrations")).rows.map((r) => r.name));
    for (const m of migrationFiles()) {
      if (done.has(m.name)) continue;
      await tx.exec(m.sql);
      await tx.query("insert into private.migrations (name) values ($1)", [m.name]);
    }
  });
}

async function open(): Promise<Db> {
  const url = hostedDatabaseUrl();
  if (url) {
    // Hosted Postgres (Supabase, Neon / Netlify DB, ...). Pending migrations are
    // applied on first connection; the auth stub only if there's no auth schema.
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), prepare: false, onnotice: () => {} });
    const hosted: Db = {
      transaction: (fn) =>
        client.begin((t) =>
          fn({
            query: async (text, params = []) => ({ rows: (await t.unsafe(text, params as never[])) as never[] }),
            exec: (text) => t.unsafe(text),
          }),
        ) as never,
    };
    await migrate(hosted, { withStub: true });
    if (process.env.STREAMOS_SEED !== "0") await seed(hosted);
    return hosted;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = resolve(process.env.PGLITE_DIR ?? (isEphemeralDemo() ? "/tmp/pglite" : join(process.cwd(), ".data", "pglite")));
  mkdirSync(dirname(dir), { recursive: true });
  const pg = new PGlite(dir);
  const db: Db = { transaction: (fn) => pg.transaction((tx) => fn(tx)) };
  await migrate(db, { withStub: true });
  if (process.env.STREAMOS_SEED !== "0") await seed(db);
  return db;
}

/** Loads the demo catalogue into an empty database. */
export async function seed(db: Db) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ n: number }>("select count(*)::int as n from public.titles");
    if (rows[0]!.n === 0) await tx.exec(readFileSync(join(DB_DIR, "seed.sql"), "utf8"));
  });
}

const g = globalThis as unknown as { __streamosDb?: Promise<Db> };

/** Process-wide database handle (survives dev hot reloads). */
export function getDb(): Promise<Db> {
  g.__streamosDb ??= open().catch((e) => {
    g.__streamosDb = undefined;
    throw e;
  });
  return g.__streamosDb;
}
