import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { getClient, getDb, isRemoteDb } from "./client";
import { seedDefaults } from "./seed";

// Migrazioni e dati di partenza, una volta per processo: all'avvio di Next (instrumentation),
// del worker e degli script. Idempotente: si può chiamare quante volte si vuole.

const holder = globalThis as unknown as { __eventStudioReady?: Promise<void> };

export function prepareDb(): Promise<void> {
  holder.__eventStudioReady ??= (async () => {
    // WAL: il sito e il worker leggono e scrivono lo stesso file senza bloccarsi
    if (!isRemoteDb()) await getClient().execute("PRAGMA journal_mode = WAL");
    const db = getDb();
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await seedDefaults(db);
  })().catch((err) => {
    holder.__eventStudioReady = undefined;
    throw err;
  });
  return holder.__eventStudioReady;
}
