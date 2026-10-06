import { and, eq, or } from "drizzle-orm";
import { ocrPage } from "@/ai/generate";
import { getDb, schema } from "@/db/client";
import { readStored } from "@/domain/documents";
import { contactsFromDocument } from "@/domain/import/drive-files";
import { renderPdfPage } from "@/domain/pdf-render";
import type { JobHandler } from "../context";
import { throwIfCancelled } from "../context";

/** Pagine da leggere: prime e ultime (i contatti nelle brochure stanno quasi sempre lì). */
export function pagesToOcr(emptyPages: number[], total: number, head = 2, tail = 6) {
  return emptyPages.filter((n) => n <= head || n > total - tail);
}

/** OCR delle pagine senza testo dei PDF archiviati, poi nuova estrazione dei contatti. */
export const documentsOcr: JobHandler = async (ctx) => {
  const db = getDb();
  const only = ctx.input.documentId ? String(ctx.input.documentId) : null;
  const docs = db
    .select()
    .from(schema.documents)
    .where(only ? eq(schema.documents.id, only) : eq(schema.documents.extractionStatus, "ocr_needed"))
    .all();
  let pagesDone = 0;
  for (const [di, doc] of docs.entries()) {
    throwIfCancelled(ctx.signal);
    if (doc.mime !== "application/pdf") continue;
    const empty = db
      .select()
      .from(schema.documentPages)
      .where(and(eq(schema.documentPages.documentId, doc.id), eq(schema.documentPages.textSource, "none")))
      .all()
      .map((p) => p.pageNumber);
    const targets = pagesToOcr(empty, doc.pageCount ?? empty.length);
    const buffer = readStored(doc.path);
    for (const [pi, pageNumber] of targets.entries()) {
      throwIfCancelled(ctx.signal);
      ctx.progress(((di + pi / Math.max(1, targets.length)) / docs.length) * 95, `${doc.filename}: pagina ${pageNumber}`);
      const png = await renderPdfPage(buffer, pageNumber, 2);
      const text = await ocrPage({ task: "documents.ocr", runId: ctx.runId, projectId: doc.projectId, signal: ctx.signal }, png.toString("base64"));
      db.update(schema.documentPages)
        .set({ text: text.trim(), textSource: "ocr" })
        .where(and(eq(schema.documentPages.documentId, doc.id), eq(schema.documentPages.pageNumber, pageNumber)))
        .run();
      pagesDone++;
    }
    db.update(schema.documents).set({ extractionStatus: "done" }).where(eq(schema.documents.id, doc.id)).run();

    // contatti dal testo appena letto, sul fornitore collegato (venue o preventivo in archivio)
    const owner =
      db.select({ supplierId: schema.venues.supplierId }).from(schema.venues).where(eq(schema.venues.documentId, doc.id)).get() ??
      db.select({ supplierId: schema.priceBenchmarks.supplierId }).from(schema.priceBenchmarks).where(eq(schema.priceBenchmarks.documentId, doc.id)).get();
    if (owner?.supplierId) contactsFromDocument(doc.id, owner.supplierId);
  }
  return { documents: docs.length, pages: pagesDone };
};

export const ocrPendingCount = () =>
  getDb()
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(or(eq(schema.documents.extractionStatus, "ocr_needed")))
    .all().length;
