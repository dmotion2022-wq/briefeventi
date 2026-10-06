import "@/lib/load-env";
import { getDb } from "@/db/client";
import { CancelledError } from "./context";
import { jobs } from "./registry";
import {
  claimNextRun,
  failRun,
  finishRun,
  heartbeat,
  isCancelRequested,
  markOrphansInterrupted,
  markProgress,
  type Run,
} from "./runs";

const MAX_CONCURRENT = 2;
const POLL_MS = 500;
const active = new Map<string, AbortController>();
let stopping = false;

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), "[worker]", ...args);

async function execute(run: Run) {
  const handler = jobs[run.task];
  const controller = new AbortController();
  active.set(run.id, controller);

  // Controllo periodico: battito e richiesta di annullamento dall'interfaccia.
  const watcher = setInterval(() => {
    heartbeat(run.id);
    if (isCancelRequested(run.id)) controller.abort();
  }, 1000);

  try {
    if (!handler) throw new Error(`Task sconosciuto: ${run.task}`);
    log(`avvio ${run.task} (${run.id})`);
    const output = await handler({
      run,
      runId: run.id,
      projectId: run.projectId,
      input: run.input ?? {},
      signal: controller.signal,
      progress: (pct, message) => markProgress(run.id, pct, message),
      log: (...args) => log(`[${run.task}]`, ...args),
    });
    finishRun(run.id, output ?? {});
    log(`fine ${run.task} (${run.id})`);
  } catch (err) {
    const cancelled = err instanceof CancelledError || controller.signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    failRun(run.id, message, stopping ? "interrupted" : cancelled ? "cancelled" : "failed");
    log(cancelled ? `annullato ${run.task}` : `errore ${run.task}: ${message}`);
    if (!cancelled && err instanceof Error && err.stack) console.error(err.stack);
  } finally {
    clearInterval(watcher);
    active.delete(run.id);
  }
}

async function loop() {
  while (!stopping) {
    while (active.size < MAX_CONCURRENT) {
      const run = claimNextRun();
      if (!run) break;
      void execute(run);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  log(`arresto: ${active.size} lavori in corso segnati come interrotti`);
  for (const controller of active.values()) controller.abort();
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

getDb();
const orphans = markOrphansInterrupted();
log(`pronto (task registrati: ${Object.keys(jobs).length}${orphans ? `, ${orphans} lavori interrotti recuperati` : ""})`);
void loop();
