import fs from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";
import { dataPath } from "./paths";

// File dell'app (PDF dei brief, immagini, export, pagine dei siti salvate come prova):
// sul Mac nella cartella data/, in cloud in un archivio Vercel Blob privato.
// Nel database si salva solo il percorso relativo ("files/<hash>.pdf"), uguale nei due casi.

export const usesBlob = () => !!(process.env.BLOB_STORE_ID?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim());

/** Percorso relativo pulito: niente "..", niente percorsi assoluti, sempre con "/". */
export function storageKey(rel: string) {
  const norm = path.posix.normalize(rel.replaceAll("\\", "/"));
  if (!norm || norm === "." || norm.startsWith("../") || norm === ".." || path.posix.isAbsolute(norm)) {
    throw new Error(`Percorso di file non valido: ${rel}`);
  }
  return norm;
}

function assertWritable() {
  if (process.env.VERCEL && !usesBlob()) {
    throw new Error("Archivio dei file non configurato: collega un Blob store (privato) al progetto su Vercel.");
  }
}

export async function saveFile(rel: string, data: Buffer | Uint8Array | string, contentType?: string) {
  const key = storageKey(rel);
  assertWritable();
  if (usesBlob()) {
    const body = typeof data === "string" ? data : Buffer.from(data);
    await put(key, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
  } else {
    const abs = dataPath(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }
  return key;
}

/** Contenuto del file, o null se non esiste. */
export async function readFile(rel: string): Promise<Buffer | null> {
  const key = storageKey(rel);
  if (usesBlob()) {
    const res = await get(key, { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  try {
    return await fs.readFile(dataPath(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function fileExists(rel: string) {
  const key = storageKey(rel);
  if (usesBlob()) {
    try {
      await head(key);
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw err;
    }
  }
  try {
    await fs.access(dataPath(key));
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(rel: string) {
  const key = storageKey(rel);
  if (usesBlob()) {
    try {
      await del(key);
    } catch (err) {
      if (!(err instanceof BlobNotFoundError)) throw err;
    }
    return;
  }
  await fs.rm(dataPath(key), { force: true });
}
