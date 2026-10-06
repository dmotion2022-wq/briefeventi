import { reextractPdfContacts } from "@/domain/import/drive-files";
import type { SyncReport } from "@/domain/import/drive-files";
import { runDriveImport } from "@/domain/import/run-import";
import type { JobHandler } from "../context";
import { continueLater } from "../context";

// Margine per chiudere il file in corso e salvare prima che la funzione cloud venga chiusa.
const STOP_MARGIN_MS = 60_000;

export const libraryImport: JobHandler = async (ctx) => {
  const mode = String(ctx.input.mode ?? "dry");
  if (mode === "contacts") {
    ctx.progress(20, "Ricalcolo dei contatti dai PDF archiviati");
    return { contacts: await reextractPdfContacts() };
  }
  // alla ripresa (cloud) il foglio è già importato: restano i PDF
  const resumed = ctx.input.resumed as { diff?: unknown; files?: SyncReport } | undefined;
  const { diff, files } = await runDriveImport({
    apply: mode === "full",
    files: mode === "full",
    skipSheet: !!resumed,
    signal: ctx.signal,
    onProgress: (pct, message) => ctx.progress(pct, message),
    shouldStop: () => ctx.timeLeft() < STOP_MARGIN_MS,
  });
  const merged = files && resumed?.files ? mergeReports(resumed.files, files) : files;
  if (files?.pending) {
    return continueLater({ ...ctx.input, resumed: { diff: resumed?.diff ?? diff, files: merged } }, `PDF rimasti: ${files.pending}. Continua…`);
  }
  return { mode, diff: resumed?.diff ?? diff, files: merged };
};

/** Somma i resoconti di più esecuzioni dello stesso import. */
function mergeReports(a: SyncReport, b: SyncReport): SyncReport {
  return {
    listed: b.listed,
    downloaded: a.downloaded + b.downloaded,
    // i file scaricati nella prima esecuzione risultano "già presenti" nella seconda
    reused: Math.max(0, b.reused - a.downloaded),
    failed: [...a.failed, ...b.failed],
    unindexed: [...new Set([...a.unindexed, ...b.unindexed])],
    ocrNeeded: [...new Set([...a.ocrNeeded, ...b.ocrNeeded])],
    contacts: { phones: a.contacts.phones + b.contacts.phones, emails: a.contacts.emails + b.contacts.emails },
    pending: b.pending,
  };
}
