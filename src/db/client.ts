import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import * as schema from "./schema";
import { seedDefaults } from "./seed";

export type Db = BetterSQLite3Database<typeof schema>;

type Holder = { db?: Db; sqlite?: Database.Database };
// In sviluppo Next ricarica i moduli: teniamo una sola connessione per processo.
const holder = globalThis as unknown as { __eventStudioDb?: Holder };
holder.__eventStudioDb ??= {};

export function getDb(): Db {
  const h = holder.__eventStudioDb!;
  if (h.db) return h.db;

  ensureDataDirs();
  const sqlite = new Database(dataPath("app.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  seedDefaults(db);

  h.db = db;
  h.sqlite = sqlite;
  return db;
}

export function getSqlite(): Database.Database {
  getDb();
  return holder.__eventStudioDb!.sqlite!;
}

export { schema };
