import type { Run } from "./runs";

export type JobContext = {
  run: Run;
  runId: string;
  projectId: string | null;
  input: Record<string, unknown>;
  signal: AbortSignal;
  /** Aggiorna barra e messaggio di avanzamento (0-100). Le scritture partono in sottofondo, in ordine. */
  progress: (pct: number, message?: string) => void;
  /**
   * Millisecondi prima che la funzione cloud venga chiusa (Infinity sul Mac). Prima di un passo lungo,
   * se il tempo non basta, il lavoro restituisce `continueLater(...)` e riparte in una nuova esecuzione.
   */
  timeLeft: () => number;
  log: (...args: unknown[]) => void;
};

/** Il lavoro continua in una nuova esecuzione con questo input (stesso run, stessa barra). */
export class Continue {
  constructor(
    readonly input: Record<string, unknown>,
    readonly message: string,
  ) {}
}

export const continueLater = (input: Record<string, unknown>, message = "Continua…") => new Continue(input, message);

/** Tempo che serve di solito a un passo con il modello grande: sotto questa soglia meglio ripartire. */
export const LONG_STEP_MS = 150_000;

export type JobResult = Record<string, unknown> | void | Continue;
export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

export class CancelledError extends Error {
  constructor() {
    super("Annullato dall'utente");
  }
}

export function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new CancelledError();
}
