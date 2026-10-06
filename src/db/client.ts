import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { pathToFileURL } from "node:url";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import * as schema from "./schema";

// Un solo codice per due database: sul Mac il file data/app.db, in cloud Turso
// (SQLite remoto, stesse tabelle e stesse query). Lo decide TURSO_DATABASE_URL.

export type Db = LibSQLDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Database o transazione in corso: le funzioni che scrivono accettano entrambi. */
export type DbOrTx = Db | Tx;

type Holder = { db?: Db; client?: Client };
// In sviluppo Next ricarica i moduli: teniamo una sola connessione per processo.
const holder = globalThis as unknown as { __eventStudioDb?: Holder };
holder.__eventStudioDb ??= {};

export const isRemoteDb = () => !!process.env.TURSO_DATABASE_URL?.trim();

function connect(): Client {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (url) {
    // HTTP invece di WebSocket: ogni richiesta è indipendente, come le funzioni serverless.
    return createClient({ url: url.replace(/^libsql:\/\//i, "https://"), authToken: process.env.TURSO_AUTH_TOKEN?.trim() });
  }
  if (process.env.VERCEL) {
    // online non c'è un disco su cui scrivere: senza Turso l'app non può partire
    throw new Error("Database non collegato: aggiungi Turso al progetto su Vercel (Storage) e ripubblica.");
  }
  ensureDataDirs();
  // timeout = attesa massima se il worker sta scrivendo nello stesso momento
  return createClient({ url: pathToFileURL(dataPath("app.db")).href, timeout: 5000 });
}

export function getDb(): Db {
  const h = holder.__eventStudioDb!;
  if (!h.db) {
    h.client = connect();
    h.db = drizzle(h.client, { schema });
  }
  return h.db;
}

export function getClient(): Client {
  getDb();
  return holder.__eventStudioDb!.client!;
}

/** Chiude la connessione (script e test). */
export function closeDb() {
  const h = holder.__eventStudioDb!;
  h.client?.close();
  h.client = undefined;
  h.db = undefined;
}

export { schema };
