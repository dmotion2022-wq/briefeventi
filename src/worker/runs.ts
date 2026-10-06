import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, getSqlite, schema } from "@/db/client";
import { newId } from "@/lib/ids";

export type Run = typeof schema.aiRuns.$inferSelect;

/** Accoda un lavoro per il worker. Restituisce l'ID del run. */
export function enqueueRun(args: {
  task: string;
  projectId?: string | null;
  input?: Record<string, unknown>;
  parentRunId?: string | null;
}) {
  const id = newId("run");
  getDb()
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
  return id;
}

export const getRun = (id: string) =>
  getDb().select().from(schema.aiRuns).where(eq(schema.aiRuns.id, id)).get();

export function listRuns(opts: { projectId?: string; limit?: number } = {}) {
  const db = getDb();
  const q = db.select().from(schema.aiRuns);
  const filtered = opts.projectId ? q.where(eq(schema.aiRuns.projectId, opts.projectId)) : q;
  return filtered.orderBy(desc(schema.aiRuns.createdAt)).limit(opts.limit ?? 100).all();
}

/** Lavori ancora attivi di un progetto (per mostrare l'avanzamento nelle pagine). */
export function activeRuns(projectId: string) {
  return getDb()
    .select()
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.projectId, projectId), inArray(schema.aiRuns.status, ["queued", "running"])))
    .orderBy(desc(schema.aiRuns.createdAt))
    .all();
}

export function requestCancel(id: string) {
  const db = getDb();
  const run = getRun(id);
  if (!run) return;
  if (run.status === "queued") {
    db.update(schema.aiRuns)
      .set({ status: "cancelled", finishedAt: new Date().toISOString(), progressMessage: "Annullato" })
      .where(eq(schema.aiRuns.id, id))
      .run();
  } else if (run.status === "running") {
    db.update(schema.aiRuns).set({ cancelRequested: true }).where(eq(schema.aiRuns.id, id)).run();
  }
}

/** Rimette in coda un run interrotto o fallito con lo stesso input. */
export function retryRun(id: string) {
  const run = getRun(id);
  if (!run) return null;
  return enqueueRun({ task: run.task, projectId: run.projectId, input: run.input ?? {}, parentRunId: run.id });
}

// ── Solo per il worker ───────────────────────────────────────────────────────

/** Prende in carico il prossimo lavoro in coda in modo atomico. */
export function claimNextRun(): Run | undefined {
  const now = new Date().toISOString();
  const row = getSqlite()
    .prepare(
      `UPDATE ai_runs SET status = 'running', started_at = ?, heartbeat_at = ?, progress_message = 'Avviato'
       WHERE id = (SELECT id FROM ai_runs WHERE status = 'queued' ORDER BY created_at LIMIT 1)
       RETURNING id`,
    )
    .get(now, now) as { id: string } | undefined;
  return row ? getRun(row.id) : undefined;
}

export function markProgress(id: string, progress: number, message?: string) {
  getDb()
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
 * sono arrivati, al massimo una volta al secondo. La percentuale resta quella decisa dal job.
 */
export function streamReporter(runId: string | null | undefined) {
  let step: string | null | undefined;
  let last = 0;
  return (p: { phase: "reasoning" | "writing"; chars: number }) => {
    if (!runId || Date.now() - last < 1000) return;
    last = Date.now();
    const db = getDb();
    step ??= db.select({ m: schema.aiRuns.progressMessage }).from(schema.aiRuns).where(eq(schema.aiRuns.id, runId)).get()?.m ?? null;
    db.update(schema.aiRuns)
      .set({ progressMessage: streamMessage(step, p), heartbeatAt: new Date().toISOString() })
      .where(eq(schema.aiRuns.id, runId))
      .run();
  };
}

export function heartbeat(id: string) {
  getDb().update(schema.aiRuns).set({ heartbeatAt: new Date().toISOString() }).where(eq(schema.aiRuns.id, id)).run();
}

export function isCancelRequested(id: string) {
  return (
    getDb().select({ c: schema.aiRuns.cancelRequested }).from(schema.aiRuns).where(eq(schema.aiRuns.id, id)).get()
      ?.c ?? false
  );
}

export function finishRun(id: string, output: Record<string, unknown> = {}) {
  getDb()
    .update(schema.aiRuns)
    .set({ status: "done", progress: 100, progressMessage: "Completato", output, finishedAt: new Date().toISOString() })
    .where(eq(schema.aiRuns.id, id))
    .run();
}

export function failRun(id: string, error: string, status: "failed" | "cancelled" | "interrupted" = "failed") {
  getDb()
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
export function markOrphansInterrupted() {
  return getDb()
    .update(schema.aiRuns)
    .set({ status: "interrupted", progressMessage: "Interrotto (riavvio)", finishedAt: new Date().toISOString() })
    .where(eq(schema.aiRuns.status, "running"))
    .run().changes;
}

/** Registra una chiamata al modello e aggiorna i totali del run. */
export function recordAiCall(call: Omit<typeof schema.aiCalls.$inferInsert, "id" | "createdAt">) {
  const db = getDb();
  db.insert(schema.aiCalls).values(call).run();
  if (call.runId) {
    db.update(schema.aiRuns)
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
