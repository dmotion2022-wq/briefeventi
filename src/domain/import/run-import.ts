import { getSetting, setSetting } from "@/lib/settings";
import { applyPlan, diffPlan, fetchPlan, type ImportDiff } from "./drive";
import { discoverDriveSource } from "./drive-discover";
import { syncDriveFiles, type SyncReport } from "./drive-files";

// Pipeline completa usata sia dallo script sia dal worker.
export async function runDriveImport(opts: {
  apply: boolean;
  files: boolean;
  /** I PDF già archiviati vengono saltati: alla ripresa si passa direttamente ai file. */
  skipSheet?: boolean;
  signal?: AbortSignal;
  onProgress?: (pct: number, message: string) => void;
  shouldStop?: () => boolean;
}): Promise<{ diff?: ImportDiff; files?: SyncReport }> {
  let source = await getSetting("drive.source");
  // con il solo link della cartella si ricavano foglio, schede e sottocartelle
  if (source.folderUrl && (!source.sheetId || !source.gids.works || !source.folders.works)) {
    const found = await discoverDriveSource(source.folderUrl, opts.signal);
    source = { ...source, ...found.source };
    await setSetting("drive.source", source);
  }
  if (!source.sheetId || !source.gids.works) {
    throw new Error("Archivio Drive non impostato: incolla il link della cartella in Impostazioni → Archivio Drive.");
  }
  let diff: ImportDiff | undefined;
  if (!opts.skipSheet) {
    opts.onProgress?.(2, "Lettura del foglio Executive Summary");
    const plan = await fetchPlan(source, opts.signal);
    diff = opts.apply ? await applyPlan(plan) : await diffPlan(plan);
  }
  if (!opts.apply || !opts.files) return { diff };

  opts.onProgress?.(10, "Elenco dei PDF nelle cartelle");
  const files = await syncDriveFiles(source, {
    signal: opts.signal,
    shouldStop: opts.shouldStop,
    onProgress: (done, total, name) => opts.onProgress?.(10 + (done / Math.max(1, total)) * 88, `PDF ${done}/${total}: ${name}`),
  });
  return { diff, files };
}
