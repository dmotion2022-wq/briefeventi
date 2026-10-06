// Migrazioni del database prima di pubblicare (su Vercel le lancia "vercel-build").
// Senza TURSO_DATABASE_URL non fa nulla: il database del Mac si aggiorna da solo all'avvio.
import "@/lib/load-env";
import { closeDb, isRemoteDb } from "@/db/client";
import { prepareDb } from "@/db/prepare";

if (!isRemoteDb()) {
  console.log("[migrate] nessun database remoto (TURSO_DATABASE_URL): salto.");
} else {
  await prepareDb();
  console.log("[migrate] database Turso aggiornato.");
  closeDb();
}
