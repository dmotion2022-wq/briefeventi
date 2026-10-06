import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));

export const dataPath = (...parts: string[]) => path.join(DATA_DIR, ...parts);

const SUBDIRS = ["files", "images", "exports", "evidence", "backups", "cache/drive"] as const;

export function ensureDataDirs() {
  for (const dir of SUBDIRS) fs.mkdirSync(dataPath(dir), { recursive: true });
}
