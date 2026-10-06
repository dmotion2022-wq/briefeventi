import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Ogni file di test lavora su un database temporaneo, mai su data/app.db. */
export function setupTempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "event-studio-test-"));
  process.env.DATA_DIR = dir;
  return dir;
}
