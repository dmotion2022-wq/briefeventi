import { CancelledError, Continue } from "./context";
import { dispatchRun } from "./dispatch";
import { jobs } from "./registry";
import { failRun, finishRun, heartbeat, isCancelRequested, markProgress, requeueRun, type Run } from "./runs";

// Esecuzione di un lavoro, uguale per il worker del Mac e per la funzione cloud
// (src/app/api/runs/[id]/execute): battito, annullamento, avanzamento, esito.

type Options = {
  /** Tempo a disposizione (cloud). Senza, il lavoro può durare quanto serve. */
  budgetMs?: number;
  /** Battito e controllo dell'annullamento ogni N millisecondi. */
  heartbeatMs?: number;
  /** Il worker si sta chiudendo: l'errore che ne segue è un'interruzione, non un fallimento. */
  isStopping?: () => boolean;
  signal?: AbortSignal;
  log?: (...args: unknown[]) => void;
};

export async function executeRun(run: Run, opts: Options = {}) {
  const log = opts.log ?? ((...args: unknown[]) => console.log("[run]", ...args));
  const handler = jobs[run.task];
  const controller = new AbortController();
  opts.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : Infinity;

  // Le scritture di avanzamento vanno in fila: arrivano in ordine e si aspettano prima dell'esito.
  let writes: Promise<void> = Promise.resolve();
  const queue = (write: () => Promise<unknown>) => {
    writes = writes.then(write).then(
      () => {},
      (err) => log("scrittura avanzamento non riuscita:", err instanceof Error ? err.message : err),
    );
  };

  const watcher = setInterval(() => {
    queue(() => heartbeat(run.id));
    isCancelRequested(run.id).then(
      (cancel) => cancel && controller.abort(),
      () => {},
    );
  }, opts.heartbeatMs ?? 1000);

  try {
    if (!handler) throw new Error(`Task sconosciuto: ${run.task}`);
    log(`avvio ${run.task} (${run.id})`);
    const output = await handler({
      run,
      runId: run.id,
      projectId: run.projectId,
      input: run.input ?? {},
      signal: controller.signal,
      progress: (pct, message) => queue(() => markProgress(run.id, pct, message)),
      timeLeft: () => deadline - Date.now(),
      log: (...args) => log(`[${run.task}]`, ...args),
    });
    clearInterval(watcher);
    await writes;
    if (output instanceof Continue) {
      await requeueRun(run.id, output.input, output.message);
      log(`continua ${run.task} (${run.id})`);
      await dispatchRun(run.id);
      return;
    }
    await finishRun(run.id, output ?? {});
    log(`fine ${run.task} (${run.id})`);
  } catch (err) {
    clearInterval(watcher);
    await writes;
    const cancelled = err instanceof CancelledError || controller.signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    await failRun(run.id, message, opts.isStopping?.() ? "interrupted" : cancelled ? "cancelled" : "failed");
    log(cancelled ? `annullato ${run.task}` : `errore ${run.task}: ${message}`);
    if (!cancelled && err instanceof Error && err.stack) console.error(err.stack);
  } finally {
    clearInterval(watcher);
  }
}
