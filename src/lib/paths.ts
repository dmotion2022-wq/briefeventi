import fs from "node:fs";
import path from "node:path";

// Cartella dei dati sul Mac (database, PDF, immagini, export). Online non si usa: database su Turso, file su Blob.
// turbopackIgnore: è una cartella di lavoro, non deve finire nel pacchetto del server.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));

export const dataPath = (...parts: string[]) => path.join(/*turbopackIgnore: true*/ DATA_DIR, ...parts);

const SUBDIRS = ["files", "images", "exports", "evidence", "backups", "cache/drive"] as const;

export function ensureDataDirs() {
  for (const dir of SUBDIRS) fs.mkdirSync(dataPath(dir), { recursive: true });
}
