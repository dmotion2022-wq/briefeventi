import { NextResponse } from "next/server";
import { getRun, requestCancel } from "@/worker/runs";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Lavoro non trovato" }, { status: 404 });
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
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  requestCancel(id);
  return NextResponse.json({ ok: true });
}
