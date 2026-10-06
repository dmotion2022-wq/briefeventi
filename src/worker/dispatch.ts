import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

// In cloud non c'è un worker sempre acceso: ogni lavoro accodato si avvia chiamando
// /api/runs/<id>/execute, che lo esegue in una funzione sua (con il suo tempo massimo).
// Sul Mac non fa nulla: il lavoro lo prende il worker.

export const usesDispatch = () => !!process.env.VERCEL || process.env.RUN_MODE === "dispatch";

/** Indirizzo del sito per chiamare se stesso. In cloud il dominio di produzione, che non è protetto. */
export function appBaseUrl() {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment}`;
  return `http://127.0.0.1:${process.env.PORT || 3100}`;
}

export async function dispatchRun(id: string) {
  if (!usesDispatch()) return;
  const db = getDb();
  const token = randomBytes(24).toString("base64url");
  const res = await db
    .update(schema.aiRuns)
    .set({ dispatchToken: token })
    .where(and(eq(schema.aiRuns.id, id), eq(schema.aiRuns.status, "queued")))
    .run();
  if (!res.rowsAffected) return;

  const headers: Record<string, string> = { "x-run-token": token };
  // se nel progetto Vercel è attiva la protezione di tutte le versioni
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  let problem: string | null = null;
  try {
    const r = await fetch(`${appBaseUrl()}/api/runs/${id}/execute`, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    // 202 avviato, 409 già preso da un'altra esecuzione
    if (r.status !== 202 && r.status !== 409) problem = `HTTP ${r.status}`;
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  if (problem) {
    // solo se nessuno l'ha preso nel frattempo
    await db
      .update(schema.aiRuns)
      .set({
        status: "failed",
        error: `Avvio del lavoro non riuscito (${problem}): riprova.`,
        progressMessage: "Errore",
        finishedAt: new Date().toISOString(),
      })
      .where(and(eq(schema.aiRuns.id, id), eq(schema.aiRuns.status, "queued")))
      .run();
  }
}
