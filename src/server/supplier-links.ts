"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { parseItalianAmount } from "@/lib/money";
import { enqueueRun } from "@/worker/runs";

const path = (projectId: string) => `/projects/${projectId}/suppliers`;

function linkOrThrow(linkId: string) {
  const link = getDb().select().from(schema.supplierLinks).where(eq(schema.supplierLinks.id, linkId)).get();
  if (!link) throw new Error("Collegamento non trovato");
  return link;
}

export async function setLinkStatusAction(linkId: string, form: FormData) {
  const status = z.enum(schema.LINK_STATUSES).parse(form.get("status"));
  const link = linkOrThrow(linkId);
  getDb().update(schema.supplierLinks).set({ status }).where(eq(schema.supplierLinks.id, linkId)).run();
  revalidatePath(path(link.projectId));
}

/** Registra una chiamata o un'email; il primo contatto porta lo stato a "contattato". */
export async function logInteractionAction(linkId: string, form: FormData) {
  const link = linkOrThrow(linkId);
  const channel = z.enum(["phone", "email", "whatsapp", "meeting", "other"]).parse(form.get("channel"));
  const outcome = String(form.get("outcome") ?? "").trim();
  const db = getDb();
  db.insert(schema.supplierInteractions).values({ linkId, channel, outcome: outcome || null }).run();
  if (link.status === "to_contact") db.update(schema.supplierLinks).set({ status: "contacted" }).where(eq(schema.supplierLinks.id, linkId)).run();
  revalidatePath(path(link.projectId));
}

/**
 * Prezzo e condizioni del fornitore. Con "usa nel preventivo" il costo della voce diventa quello
 * del fornitore (origine: preventivo fornitore) e il prezzo entra nel listino per i prossimi progetti.
 */
export async function saveSupplierQuoteAction(linkId: string, form: FormData) {
  const link = linkOrThrow(linkId);
  const db = getDb();
  const cost = parseItalianAmount(String(form.get("cost") ?? ""));
  const includesVat = form.get("includesVat") === "on";
  const optionExpiresAt = String(form.get("optionExpiresAt") ?? "").trim() || null;
  const notes = String(form.get("notes") ?? "").trim() || null;
  const apply = form.get("apply") === "on";
  db.update(schema.supplierLinks)
    .set({
      quotedCostCents: cost,
      quotedCostIncludesVat: includesVat,
      optionExpiresAt,
      notes,
      status: apply ? "confirmed" : cost != null && link.status !== "confirmed" ? "quote_received" : link.status,
    })
    .where(eq(schema.supplierLinks.id, linkId))
    .run();

  if (apply && cost != null && link.quoteLineId) {
    const line = db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, link.quoteLineId)).get();
    const quote = line ? db.select().from(schema.quotes).where(eq(schema.quotes.id, line.quoteId)).get() : undefined;
    if (line && quote?.status === "draft") {
      const periods = line.periods > 0 ? line.periods : 1;
      const perUnit = line.pricingModel === "unit" || line.pricingModel === "per_pax";
      db.update(schema.quoteLines)
        .set({
          ...(perUnit
            ? { unitCostCents: Math.round(cost / Math.max(1, line.quantity * periods)) }
            : { pricingModel: line.pricingModel === "percent" ? "forfait" : line.pricingModel, fixedCostCents: Math.round(cost / periods) }),
          costIncludesVat: includesVat,
          costSource: "supplier_quote",
          supplierId: link.supplierId,
          estimateMinCents: null,
          estimateMaxCents: null,
        })
        .where(eq(schema.quoteLines.id, line.id))
        .run();
    }
    // il listino impara: ogni prezzo confermato diventa un riferimento per le stime future
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, link.projectId)).get();
    const supplier = db.select().from(schema.suppliers).where(eq(schema.suppliers.id, link.supplierId)).get();
    db.insert(schema.priceBenchmarks)
      .values({
        id: newId("bmk"),
        category: link.category ?? line?.description ?? "altro",
        supplierId: link.supplierId,
        supplierName: supplier?.name ?? null,
        city: project?.city ?? supplier?.city ?? null,
        useCase: [project?.eventType, line?.description].filter(Boolean).join(" · "),
        paxRef: project?.paxTarget ?? null,
        observedAt: new Date().toISOString().slice(0, 10),
        pricingModel: line?.pricingModel ?? "forfait",
        unit: line?.unit ?? null,
        totalCents: cost,
        vatIncluded: includesVat ? "yes" : "no",
        included: line?.detail ?? null,
        excluded: notes,
        sourceKind: "supplier_quote",
        sourceKey: `link:${link.id}`,
      })
      .onConflictDoUpdate({ target: schema.priceBenchmarks.sourceKey, set: { totalCents: cost, vatIncluded: includesVat ? "yes" : "no", excluded: notes } })
      .run();
  }
  revalidatePath(path(link.projectId));
  revalidatePath(`/projects/${link.projectId}/quote`);
}

export async function addLinkAction(projectId: string, quoteLineId: string, form: FormData) {
  const supplierId = String(form.get("supplierId") ?? "");
  if (!supplierId) return;
  const db = getDb();
  const line = db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, quoteLineId)).get();
  db.insert(schema.supplierLinks)
    .values({ id: newId("lnk"), projectId, quoteLineId, componentId: line?.componentId ?? null, supplierId, status: "to_contact" })
    .run();
  revalidatePath(path(projectId));
}

export async function removeLinkAction(linkId: string) {
  const link = linkOrThrow(linkId);
  getDb().delete(schema.supplierLinks).where(eq(schema.supplierLinks.id, linkId)).run();
  revalidatePath(path(link.projectId));
}

export async function searchSuppliersAction(projectId: string, quoteLineId: string) {
  enqueueRun({ task: "supplier.search", projectId, input: { quoteLineId } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function draftRfqAction(linkId: string) {
  const link = linkOrThrow(linkId);
  enqueueRun({ task: "rfq.draft", projectId: link.projectId, input: { linkId } });
  revalidatePath(`/projects/${link.projectId}`, "layout");
}
