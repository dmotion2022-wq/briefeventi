"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type RunState = {
  status: string;
  progress: number;
  progressMessage: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  now: string;
};

const seconds = (from: string | null, to: string) => (from ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000) : 0);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Avvisi quando il lavoro non avanza per motivi esterni: worker spento o fermo. Tempi misurati sull'orologio del server. */
function stuckHint(run: RunState) {
  if (run.status === "queued" && seconds(run.createdAt, run.now) > 10) {
    return "Il lavoro non è ancora partito: il worker sembra spento. Chiudi Event Studio e riaprilo con il doppio clic.";
  }
  if (run.status === "running" && seconds(run.heartbeatAt, run.now) > 20) {
    return "Il worker non dà segni di vita da più di 20 secondi: Event Studio è ancora acceso?";
  }
  return null;
}

/** Barra di avanzamento di un lavoro del worker; a fine lavoro ricarica la pagina. */
export function RunProgress({ runId, label }: { runId: string; label?: string }) {
  const router = useRouter();
  const [run, setRun] = useState<RunState | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as RunState;
          if (!alive) return;
          setRun(data);
          if (!["queued", "running"].includes(data.status)) {
            router.refresh();
            return;
          }
        }
      } catch {
        // il server di sviluppo può riavviarsi: si riprova al giro successivo
      }
      timer = setTimeout(poll, 1200);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [runId, router]);

  if (!run || !["queued", "running"].includes(run.status)) {
    if (run?.status === "failed") {
      return <div className="rounded-sm bg-warn-soft px-3 py-2 text-[13px] text-warn">Errore: {run.error}</div>;
    }
    return null;
  }

  const hint = stuckHint(run);
  return (
    <div className="flex items-center gap-3 rounded-sm border border-violet/30 bg-violet-soft px-3 py-2">
      <LoaderCircle size={16} className="animate-spin text-violet" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="truncate font-medium text-ink">{label ?? "Lavoro in corso"}</span>
          <span className="font-mono text-[11px] text-n500">
            {run.progress}%{run.startedAt && ` · ${clock(seconds(run.startedAt, run.now))}`}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white">
          <div className="h-full bg-violet transition-all" style={{ width: `${Math.max(3, run.progress)}%` }} />
        </div>
        {run.progressMessage && <div className="mt-1 truncate text-[12px] text-n500">{run.progressMessage}</div>}
        {hint && <div className="mt-1 text-[12px] text-warn">{hint}</div>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        title="Annulla"
        onClick={() => fetch(`/api/runs/${runId}`, { method: "DELETE" }).then(() => router.refresh())}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
