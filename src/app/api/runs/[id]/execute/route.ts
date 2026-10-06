import { after } from "next/server";
import { executeRun } from "@/worker/execute";
import { claimRun } from "@/worker/runs";

// Esecuzione di un lavoro in cloud: la chiama solo il sito stesso (src/worker/dispatch.ts),
// con il gettone monouso salvato sul run. Risponde subito e lavora dopo la risposta.

// Tempo massimo della funzione: 300 s vale su tutti i piani Vercel. I lavori lunghi
// ripartono da soli in una nuova esecuzione prima di arrivarci (vedi Continue).
export const maxDuration = 300;
const MARGIN_MS = 45_000;

export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/execute">) {
  const { id } = await ctx.params;
  const run = await claimRun(id, req.headers.get("x-run-token") ?? "");
  if (!run) return new Response("Lavoro non in coda o gettone non valido", { status: 409 });
  after(() => executeRun(run, { budgetMs: maxDuration * 1000 - MARGIN_MS, heartbeatMs: 3000 }));
  return new Response(null, { status: 202 });
}
