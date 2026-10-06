// Controllo della configurazione online: cosa manca nel progetto Vercel perché l'app funzioni.
// Si guardano solo le variabili d'ambiente (mai i valori), senza toccare il database.

export type SetupCheck = { key: string; label: string; ok: boolean; required: boolean; how: string };

export function cloudSetupChecks(): SetupCheck[] {
  const has = (...names: string[]) => names.every((n) => !!process.env[n]?.trim());
  return [
    {
      key: "db",
      label: "Database (Turso)",
      ok: has("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"),
      required: true,
      how: "Progetto → Storage → Create Storage → Turso Cloud (regione Francoforte) → collegalo al progetto.",
    },
    {
      key: "blob",
      label: "Archivio dei file (Blob privato)",
      ok: has("BLOB_STORE_ID") || has("BLOB_READ_WRITE_TOKEN"),
      required: true,
      how: "Progetto → Storage → Create Storage → Blob → accesso Private (regione Francoforte) → collegalo al progetto.",
    },
    {
      key: "admin",
      label: "Primo amministratore",
      ok: has("ADMIN_EMAIL", "ADMIN_PASSWORD"),
      required: false,
      how: "Settings → Environment Variables: ADMIN_EMAIL e ADMIN_PASSWORD (Sensitive). Servono solo per il primo accesso.",
    },
    {
      key: "qwen",
      label: "Chiave Qwen",
      ok: has("DASHSCOPE_API_KEY"),
      required: false,
      how: "Settings → Environment Variables: DASHSCOPE_API_KEY (Sensitive). Senza, le funzioni AI restano spente.",
    },
  ];
}

/** Online e con qualcosa di indispensabile mancante: l'app mostra la pagina di configurazione. */
export const cloudSetupIncomplete = () => !!process.env.VERCEL && cloudSetupChecks().some((c) => c.required && !c.ok);
