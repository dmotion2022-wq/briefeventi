// All'avvio del server Next: migrazioni e dati di partenza del database (vedi src/db/prepare.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareDb } = await import("@/db/prepare");
  try {
    await prepareDb();
  } catch (err) {
    // Il server parte comunque: le pagine riprovano e mostrano l'errore del database.
    console.error("[event-studio] preparazione del database non riuscita:", err);
  }
}
