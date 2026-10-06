import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTempDataDir } from "./helpers/temp-db";

const dir = setupTempDataDir();
let storage: typeof import("@/lib/storage");

beforeAll(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  storage = await import("@/lib/storage");
});

describe("archivio dei file (Mac)", () => {
  it("salva, legge, verifica ed elimina nella cartella dei dati", async () => {
    expect(storage.usesBlob()).toBe(false);
    const rel = await storage.saveFile("exports/prova.txt", "ciao", "text/plain");
    expect(rel).toBe("exports/prova.txt");
    expect(fs.readFileSync(path.join(dir, "exports", "prova.txt"), "utf8")).toBe("ciao");
    expect((await storage.readFile(rel))?.toString()).toBe("ciao");
    expect(await storage.fileExists(rel)).toBe(true);
    await storage.deleteFile(rel);
    expect(await storage.fileExists(rel)).toBe(false);
    expect(await storage.readFile(rel)).toBeNull();
  });

  it("rifiuta percorsi che escono dalla cartella", () => {
    for (const bad of ["../segreto", "/etc/passwd", "files/../../x", "", "."]) expect(() => storage.storageKey(bad)).toThrow();
    expect(storage.storageKey("files\\\\a.pdf")).toBe("files/a.pdf");
  });
});
