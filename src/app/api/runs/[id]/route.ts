import { NextResponse } from "next/server";
import { requireUser } from "@/auth/session";
import { dispatchRun, usesDispatch } from "@/worker/dispatch";
import { getRun, reapStaleRuns, requestCancel } from "@/worker/runs";

// Un avvio perso (rete, nuova versione del sito) non deve lasciare il lavoro in coda per sempre.
const REDISPATCH_AFTER_MS = 20_000;

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  await requireUser();
  const { id } = await ctx.params;
  await reapStaleRuns();
  let run = await getRun(id);
  if (!run) return NextResponse.json({ error: "Lavoro non trovato" }, { status: 404 });
  // per un lavoro che continua conta l'ultima volta che è stato rimesso in coda
  const queuedSince = Date.parse(run.heartbeatAt ?? run.createdAt);
  if (usesDispatch() && run.status === "queued" && Date.now() - queuedSince > REDISPATCH_AFTER_MS) {
    await dispatchRun(id);
    run = (await getRun(id)) ?? run;
  }
  return NextResponse.json({
    id: run.id,
    task: run.task,
    status: run.status,
    progress: run.progress,
    progressMessage: run.progressMessage,
    error: run.error,
    output: run.output,
    costMicros: run.costMicros,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    heartbeatAt: run.heartbeatAt,
    now: new Date().toISOString(),
    mode: usesDispatch() ? "cloud" : "worker",
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  await requireUser();
  const { id } = await ctx.params;
  await requestCancel(id);
  return NextResponse.json({ ok: true });
}
