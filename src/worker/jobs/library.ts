import { reextractPdfContacts } from "@/domain/import/drive-files";
import { runDriveImport } from "@/domain/import/run-import";
import type { JobHandler } from "../context";

export const libraryImport: JobHandler = async (ctx) => {
  const mode = String(ctx.input.mode ?? "dry");
  if (mode === "contacts") {
    ctx.progress(20, "Ricalcolo dei contatti dai PDF archiviati");
    return { contacts: reextractPdfContacts() };
  }
  const { diff, files } = await runDriveImport({
    apply: mode === "full",
    files: mode === "full",
    signal: ctx.signal,
    onProgress: (pct, message) => ctx.progress(pct, message),
  });
  return { mode, diff, files };
};
