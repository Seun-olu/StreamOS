import { PGlite } from "@electric-sql/pglite";
import { asUser, migrate, seed, type Db, type Sql } from "./db";

/** Fresh in-memory database with the real migrations, for tests. */
export async function memoryDb({ withSeed = false } = {}): Promise<Db & { pg: PGlite }> {
  const pg = new PGlite();
  const db = { pg, transaction: <T>(fn: (tx: Sql) => Promise<T>) => pg.transaction((tx) => fn(tx)) };
  await migrate(db, { withStub: true });
  if (withSeed) await seed(db);
  return db;
}

export async function createUser(db: Db, id: string, email: string) {
  await db.transaction(async (tx) => {
    await tx.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    await tx.query("insert into public.profiles (id, email, display_name) values ($1, $2, $3)", [id, email, email.split("@")[0]]);
  });
}

/** Runs fn as an authenticated user with RLS applied. */
export function as<T>(db: Db, uid: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await asUser(tx, uid);
    return fn(tx);
  });
}
