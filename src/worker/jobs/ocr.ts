import { and, eq, or } from "drizzle-orm";
import { ocrPage } from "@/ai/generate";
import { getDb, schema } from "@/db/client";
import { readStored } from "@/domain/documents";
import { contactsFromDocument } from "@/domain/import/drive-files";
import { renderPdfPage } from "@/domain/pdf-render";
import type { JobHandler } from "../context";
import { continueLater, throwIfCancelled } from "../context";

// Una pagina con l'OCR richiede di solito pochi secondi; si lascia margine per salvare.
const PAGE_MS = 45_000;

/** Pagine da leggere: prime e ultime (i contatti nelle brochure stanno quasi sempre lì). */
export function pagesToOcr(emptyPages: number[], total: number, head = 2, tail = 6) {
  return emptyPages.filter((n) => n <= head || n > total - tail);
}

/** OCR delle pagine senza testo dei PDF archiviati, poi nuova estrazione dei contatti. */
export const documentsOcr: JobHandler = async (ctx) => {
  const db = getDb();
  const only = ctx.input.documentId ? String(ctx.input.documentId) : null;
  const docs = await db
    .select()
    .from(schema.documents)
    .where(only ? eq(schema.documents.id, only) : eq(schema.documents.extractionStatus, "ocr_needed"))
    .all();
  // le pagine già lette passano a "ocr": alla ripresa (cloud) restano solo quelle da fare
  let pagesDone = Number(ctx.input.pagesDone ?? 0);
  for (const [di, doc] of docs.entries()) {
    throwIfCancelled(ctx.signal);
    if (doc.mime !== "application/pdf") continue;
    const empty = (
      await db
        .select()
        .from(schema.documentPages)
        .where(and(eq(schema.documentPages.documentId, doc.id), eq(schema.documentPages.textSource, "none")))
        .all()
    ).map((p) => p.pageNumber);
    const targets = pagesToOcr(empty, doc.pageCount ?? empty.length);
    const buffer = targets.length ? await readStored(doc.path) : null;
    for (const [pi, pageNumber] of targets.entries()) {
      throwIfCancelled(ctx.signal);
      if (ctx.timeLeft() < PAGE_MS) return continueLater({ ...ctx.input, pagesDone }, `Pagine lette: ${pagesDone}. Continua…`);
      ctx.progress(((di + pi / Math.max(1, targets.length)) / docs.length) * 95, `${doc.filename}: pagina ${pageNumber}`);
      const png = await renderPdfPage(buffer!, pageNumber, 2);
      const text = await ocrPage({ task: "documents.ocr", runId: ctx.runId, projectId: doc.projectId, signal: ctx.signal }, png.toString("base64"));
      await db
        .update(schema.documentPages)
        .set({ text: text.trim(), textSource: "ocr" })
        .where(and(eq(schema.documentPages.documentId, doc.id), eq(schema.documentPages.pageNumber, pageNumber)))
        .run();
      pagesDone++;
    }
    await db.update(schema.documents).set({ extractionStatus: "done" }).where(eq(schema.documents.id, doc.id)).run();

    // contatti dal testo appena letto, sul fornitore collegato (venue o preventivo in archivio)
    const owner =
      (await db.select({ supplierId: schema.venues.supplierId }).from(schema.venues).where(eq(schema.venues.documentId, doc.id)).get()) ??
      (await db
        .select({ supplierId: schema.priceBenchmarks.supplierId })
        .from(schema.priceBenchmarks)
        .where(eq(schema.priceBenchmarks.documentId, doc.id))
        .get());
    if (owner?.supplierId) await contactsFromDocument(doc.id, owner.supplierId);
  }
  return { documents: docs.length, pages: pagesDone };
};

export const ocrPendingCount = async () =>
  (await getDb().select({ id: schema.documents.id }).from(schema.documents).where(or(eq(schema.documents.extractionStatus, "ocr_needed"))).all())
    .length;
