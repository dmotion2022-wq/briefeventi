import "@/lib/load-env";
import { prepareDb } from "@/db/prepare";
import { executeRun } from "./execute";
import { jobs } from "./registry";
import { claimNextRun, markOrphansInterrupted } from "./runs";

// Worker del Mac: prende i lavori in coda e li esegue (al massimo due insieme).
// In cloud non serve: ogni lavoro parte in una funzione sua (src/worker/dispatch.ts).

const MAX_CONCURRENT = 2;
const POLL_MS = 500;
const active = new Map<string, AbortController>();
let stopping = false;

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), "[worker]", ...args);

async function loop() {
  while (!stopping) {
    try {
      while (active.size < MAX_CONCURRENT) {
        const run = await claimNextRun();
        if (!run) break;
        const controller = new AbortController();
        active.set(run.id, controller);
        void executeRun(run, { signal: controller.signal, isStopping: () => stopping, log }).finally(() => active.delete(run.id));
      }
    } catch (err) {
      log("errore nel leggere la coda:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  log(`arresto: ${active.size} lavori in corso segnati come interrotti`);
  for (const controller of active.values()) controller.abort();
  setTimeout(() => process.exit(0), 800);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await prepareDb();
const orphans = await markOrphansInterrupted();
log(`pronto (task registrati: ${Object.keys(jobs).length}${orphans ? `, ${orphans} lavori interrotti recuperati` : ""})`);
void loop();
