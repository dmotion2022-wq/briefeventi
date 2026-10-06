import { getSetting } from "@/lib/settings";
import { applyPlan, diffPlan, fetchPlan, type ImportDiff } from "./drive";
import { syncDriveFiles, type SyncReport } from "./drive-files";

// Pipeline completa usata sia dallo script sia dal worker.
export async function runDriveImport(opts: {
  apply: boolean;
  files: boolean;
  signal?: AbortSignal;
  onProgress?: (pct: number, message: string) => void;
}): Promise<{ diff: ImportDiff; files?: SyncReport }> {
  const source = getSetting("drive.source");
  if (!source.sheetId || !source.gids.works) {
    throw new Error("Archivio Drive non impostato: incolla il link della cartella in Impostazioni → Archivio Drive.");
  }
  opts.onProgress?.(2, "Lettura del foglio Executive Summary");
  const plan = await fetchPlan(source, opts.signal);
  const diff = opts.apply ? applyPlan(plan) : diffPlan(plan);
  if (!opts.apply || !opts.files) return { diff };

  opts.onProgress?.(10, "Elenco dei PDF nelle cartelle");
  const files = await syncDriveFiles(source, {
    signal: opts.signal,
    onProgress: (done, total, name) => opts.onProgress?.(10 + (done / Math.max(1, total)) * 88, `PDF ${done}/${total}: ${name}`),
  });
  return { diff, files };
}
