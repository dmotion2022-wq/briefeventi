import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { extractLinks, extractText, getDocumentProxy } from "unpdf";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { dataPath, ensureDataDirs } from "@/lib/paths";

// Archiviazione dei documenti (brief, gare, brochure, preventivi) e testo per pagina.
// I file sono salvati per hash: lo stesso PDF caricato due volte occupa spazio una volta.

export type DocumentKind = (typeof schema.DOCUMENT_KINDS)[number];

export type ExtractedPage = { pageNumber: number; text: string; textSource: "text_layer" | "none" };

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "message/rfc822": "eml",
};

export function mimeFromName(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".eml") return "message/rfc822";
  return "text/plain";
}

export function storeBuffer(buffer: Buffer, mime: string) {
  ensureDataDirs();
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const rel = path.join("files", `${sha256}.${EXT_BY_MIME[mime] ?? "bin"}`);
  const abs = dataPath(rel);
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, buffer);
  return { sha256, path: rel, sizeBytes: buffer.length };
}

export const readStored = (relPath: string) => fs.readFileSync(dataPath(relPath));

/** Testo pagina per pagina. Le pagine senza testo (scansioni, immagini) vanno all'OCR. */
export async function extractPages(buffer: Buffer, mime: string): Promise<{ pages: ExtractedPage[]; links: string[] }> {
  if (mime === "application/pdf") {
    // verbosity 0: niente avvisi sui font incorporati nella console
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: false });
    let links: string[] = [];
    try {
      links = (await extractLinks(pdf)).links;
    } catch {
      links = [];
    }
    const pages = (text as string[]).map((t, i) => {
      const clean = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      return { pageNumber: i + 1, text: clean, textSource: clean.length >= 20 ? "text_layer" : "none" } as ExtractedPage;
    });
    return { pages, links };
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return { pages: chunkAsPages(value), links: [] };
  }
  return { pages: chunkAsPages(buffer.toString("utf8")), links: [] };
}

/** Testi senza pagine (DOCX, email, testo incollato): blocchi di ~3.000 caratteri sui paragrafi. */
export function chunkAsPages(text: string, size = 3000): ExtractedPage[] {
  const paragraphs = text.replace(/\r/g, "").split(/\n{2,}/);
  const pages: ExtractedPage[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length > size) {
      pages.push({ pageNumber: pages.length + 1, text: current.trim(), textSource: "text_layer" });
      current = "";
    }
    current += `${p}\n\n`;
  }
  if (current.trim()) pages.push({ pageNumber: pages.length + 1, text: current.trim(), textSource: "text_layer" });
  return pages.length ? pages : [{ pageNumber: 1, text: "", textSource: "none" }];
}

/**
 * Registra un documento con il suo testo. Se lo stesso file (hash) è già presente
 * per lo stesso progetto (o in archivio), restituisce quello esistente.
 */
export async function createDocument(args: {
  projectId?: string | null;
  kind: DocumentKind;
  filename: string;
  buffer: Buffer;
  mime?: string;
  driveFileId?: string | null;
  sourceUrl?: string | null;
}) {
  const db = getDb();
  const mime = args.mime ?? mimeFromName(args.filename);
  const stored = storeBuffer(args.buffer, mime);
  const existing = db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.sha256, stored.sha256),
        args.projectId ? eq(schema.documents.projectId, args.projectId) : isNull(schema.documents.projectId),
      ),
    )
    .get();
  if (existing) return { document: existing, links: [] as string[], created: false };

  const { pages, links } = await extractPages(args.buffer, mime);
  const emptyPages = pages.filter((p) => p.textSource === "none").length;
  const id = newId("doc");
  const document = {
    id,
    projectId: args.projectId ?? null,
    kind: args.kind,
    filename: args.filename,
    mime,
    sha256: stored.sha256,
    path: stored.path,
    sizeBytes: stored.sizeBytes,
    pageCount: pages.length,
    extractionStatus: (emptyPages > pages.length / 2 ? "ocr_needed" : "done") as "ocr_needed" | "done",
    driveFileId: args.driveFileId ?? null,
    sourceUrl: args.sourceUrl ?? null,
  };
  db.transaction((tx) => {
    tx.insert(schema.documents).values(document).run();
    if (pages.length) {
      tx.insert(schema.documentPages)
        .values(pages.map((p) => ({ documentId: id, pageNumber: p.pageNumber, text: p.text, textSource: p.textSource })))
        .run();
    }
  });
  return { document: db.select().from(schema.documents).where(eq(schema.documents.id, id)).get()!, links, created: true };
}

export function documentPages(documentId: string) {
  return getDb()
    .select()
    .from(schema.documentPages)
    .where(eq(schema.documentPages.documentId, documentId))
    .orderBy(schema.documentPages.pageNumber)
    .all();
}
