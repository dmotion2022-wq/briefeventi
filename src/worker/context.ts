import type { Run } from "./runs";

export type JobContext = {
  run: Run;
  runId: string;
  projectId: string | null;
  input: Record<string, unknown>;
  signal: AbortSignal;
  /** Aggiorna barra e messaggio di avanzamento (0-100). */
  progress: (pct: number, message?: string) => void;
  log: (...args: unknown[]) => void;
};

export type JobResult = Record<string, unknown> | void;
export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

export class CancelledError extends Error {
  constructor() {
    super("Annullato dall'utente");
  }
}

export function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new CancelledError();
}
