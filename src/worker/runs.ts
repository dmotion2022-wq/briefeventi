import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { dispatchRun } from "./dispatch";

export type Run = typeof schema.aiRuns.$inferSelect;

/** Un lavoro "in corso" senza battito da così tanto è morto (worker spento, funzione scaduta). */
export const STALE_RUN_MS = 90_000;

/** Accoda un lavoro e restituisce l'ID del run. Sul Mac lo prende il worker; in cloud parte subito (dispatch). */
export async function enqueueRun(args: {
  task: string;
  projectId?: string | null;
  input?: Record<string, unknown>;
  parentRunId?: string | null;
}) {
  const id = newId("run");
  await getDb()
    .insert(schema.aiRuns)
    .values({
      id,
      task: args.task,
      projectId: args.projectId ?? null,
      input: args.input ?? {},
      parentRunId: args.parentRunId ?? null,
      status: "queued",
      progressMessage: "In coda",
    })
    .run();
  await dispatchRun(id);
  return id;
}

export const getRun = (id: string) => getDb().select().from(schema.aiRuns).where(eq(schema.aiRuns.id, id)).get();

export async function listRuns(opts: { projectId?: string; limit?: number } = {}) {
  await reapStaleRuns();
  const db = getDb();
  const q = db.select().from(schema.aiRuns);
  const filtered = opts.projectId ? q.where(eq(schema.aiRuns.projectId, opts.projectId)) : q;
  return filtered.orderBy(desc(schema.aiRuns.createdAt)).limit(opts.limit ?? 100).all();
}

/** Lavori ancora attivi di un progetto (per mostrare l'avanzamento nelle pagine). */
export async function activeRuns(projectId: string) {
  await reapStaleRuns();
  return getDb()
    .select()
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.projectId, projectId), inArray(schema.aiRuns.status, ["queued", "running"])))
    .orderBy(desc(schema.aiRuns.createdAt))
    .all();
}

export async function requestCancel(id: string) {
  const db = getDb();
  const run = await getRun(id);
  if (!run) return;
  if (run.status === "queued") {
    await db
      .update(schema.aiRuns)
      .set({ status: "cancelled", finishedAt: new Date().toISOString(), progressMessage: "Annullato" })
      .where(eq(schema.aiRuns.id, id))
      .run();
  } else if (run.status === "running") {
    await db.update(schema.aiRuns).set({ cancelRequested: true }).where(eq(schema.aiRuns.id, id)).run();
  }
}

/** Rimette in coda un run interrotto o fallito con lo stesso input. */
export async function retryRun(id: string) {
  const run = await getRun(id);
  if (!run) return null;
  return enqueueRun({ task: run.task, projectId: run.projectId, input: run.input ?? {}, parentRunId: run.id });
}

/**
 * I lavori rimasti "in corso" senza battito vengono segnati come interrotti: succede se il worker
 * del Mac è stato chiuso o se in cloud la funzione ha superato il tempo massimo.
 */
export async function reapStaleRuns() {
  const limit = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const res = await getDb()
    .update(schema.aiRuns)
    .set({
      status: "interrupted",
      error: "Il lavoro si è fermato senza finire (tempo massimo superato o server riavviato): riprova.",
      progressMessage: "Interrotto",
      finishedAt: new Date().toISOString(),
    })
    .where(and(eq(schema.aiRuns.status, "running"), lt(schema.aiRuns.heartbeatAt, limit)))
    .run();
  return res.rowsAffected;
}

// ── Solo per chi esegue i lavori (worker o funzione cloud) ───────────────────

/** Prende in carico il prossimo lavoro in coda in modo atomico (worker del Mac). */
export async function claimNextRun(): Promise<Run | undefined> {
  const now = new Date().toISOString();
  const rows = await getDb().all<{ id: string }>(
    sql`UPDATE ai_runs SET status = 'running', started_at = ${now}, heartbeat_at = ${now}, progress_message = 'Avviato'
        WHERE id = (SELECT id FROM ai_runs WHERE status = 'queued' ORDER BY created_at LIMIT 1)
        RETURNING id`,
  );
  return rows[0] ? getRun(rows[0].id) : undefined;
}

/** Prende in carico un lavoro preciso (cloud): solo se è in coda e il gettone di avvio corrisponde. */
export async function claimRun(id: string, token: string): Promise<Run | undefined> {
  if (!token) return undefined;
  const now = new Date().toISOString();
  const [row] = await getDb()
    .update(schema.aiRuns)
    .set({ status: "running", startedAt: now, heartbeatAt: now, progressMessage: "Avviato", dispatchToken: null })
    .where(and(eq(schema.aiRuns.id, id), eq(schema.aiRuns.status, "queued"), eq(schema.aiRuns.dispatchToken, token)))
    .returning();
  return row;
}

/** Rimette in coda un lavoro che continua in una nuova esecuzione (tempo della funzione quasi finito). */
export async function requeueRun(id: string, input: Record<string, unknown>, message: string) {
  await getDb()
    .update(schema.aiRuns)
    .set({ status: "queued", input, progressMessage: message, heartbeatAt: new Date().toISOString() })
    .where(eq(schema.aiRuns.id, id))
    .run();
}

export async function markProgress(id: string, progress: number, message?: string) {
  await getDb()
    .update(schema.aiRuns)
    .set({
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      ...(message ? { progressMessage: message } : {}),
      heartbeatAt: new Date().toISOString(),
    })
    .where(eq(schema.aiRuns.id, id))
    .run();
}

/** Messaggio di un passo con l'avanzamento dello streaming: "Analisi del brief con Qwen · Qwen scrive: 3.456 caratteri". */
export function streamMessage(step: string | null | undefined, p: { phase: "reasoning" | "writing"; chars: number }) {
  const base = step?.split(" · Qwen ")[0];
  const what = `Qwen ${p.phase === "reasoning" ? "ragiona" : "scrive"}: ${p.chars.toLocaleString("it-IT")} ${p.chars === 1 ? "carattere" : "caratteri"}`;
  return base ? `${base} · ${what}` : what;
}

/**
 * Avanzamento durante lo streaming di Qwen: aggiunge al messaggio del passo in corso quanti caratteri
 * sono arrivati, al massimo una volta ogni due secondi. La percentuale resta quella decisa dal job.
 * Le scritture partono in sottofondo: lo streaming non aspetta il database.
 */
export function streamReporter(runId: string | null | undefined) {
  let step: Promise<string | null> | undefined;
  let last = 0;
  return (p: { phase: "reasoning" | "writing"; chars: number }) => {
    if (!runId || Date.now() - last < 2000) return;
    last = Date.now();
    const db = getDb();
    step ??= db
      .select({ m: schema.aiRuns.progressMessage })
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, runId))
      .get()
      .then((r) => r?.m ?? null);
    void step
      .then((s) =>
        db
          .update(schema.aiRuns)
          .set({ progressMessage: streamMessage(s, p), heartbeatAt: new Date().toISOString() })
          .where(eq(schema.aiRuns.id, runId))
          .run(),
      )
      .catch(() => {});
  };
}

export async function heartbeat(id: string) {
  await getDb().update(schema.aiRuns).set({ heartbeatAt: new Date().toISOString() }).where(eq(schema.aiRuns.id, id)).run();
}

export async function isCancelRequested(id: string) {
  const row = await getDb().select({ c: schema.aiRuns.cancelRequested }).from(schema.aiRuns).where(eq(schema.aiRuns.id, id)).get();
  return row?.c ?? false;
}

export async function finishRun(id: string, output: Record<string, unknown> = {}) {
  await getDb()
    .update(schema.aiRuns)
    .set({ status: "done", progress: 100, progressMessage: "Completato", output, finishedAt: new Date().toISOString() })
    .where(eq(schema.aiRuns.id, id))
    .run();
}

export async function failRun(id: string, error: string, status: "failed" | "cancelled" | "interrupted" = "failed") {
  await getDb()
    .update(schema.aiRuns)
    .set({
      status,
      error,
      progressMessage: status === "cancelled" ? "Annullato" : status === "interrupted" ? "Interrotto" : "Errore",
      finishedAt: new Date().toISOString(),
    })
    .where(eq(schema.aiRuns.id, id))
    .run();
}

/** All'avvio del worker: i lavori rimasti "in corso" da un avvio precedente sono interrotti. */
export async function markOrphansInterrupted() {
  const res = await getDb()
    .update(schema.aiRuns)
    .set({ status: "interrupted", progressMessage: "Interrotto (riavvio)", finishedAt: new Date().toISOString() })
    .where(eq(schema.aiRuns.status, "running"))
    .run();
  return res.rowsAffected;
}

/** Registra una chiamata al modello e aggiorna i totali del run. */
export async function recordAiCall(call: Omit<typeof schema.aiCalls.$inferInsert, "id" | "createdAt">) {
  const db = getDb();
  await db.insert(schema.aiCalls).values(call).run();
  if (call.runId) {
    await db
      .update(schema.aiRuns)
      .set({
        model: call.model,
        inputTokens: sql`${schema.aiRuns.inputTokens} + ${call.inputTokens ?? 0}`,
        outputTokens: sql`${schema.aiRuns.outputTokens} + ${call.outputTokens ?? 0}`,
        cachedTokens: sql`${schema.aiRuns.cachedTokens} + ${call.cachedTokens ?? 0}`,
        costMicros: sql`${schema.aiRuns.costMicros} + ${call.costMicros ?? 0}`,
      })
      .where(eq(schema.aiRuns.id, call.runId))
      .run();
  }
}
