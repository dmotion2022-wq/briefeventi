"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { extractEmails, formatPhoneDisplay, normalizePhone, phoneType } from "@/domain/contacts/phone";
import { newId } from "@/lib/ids";
import { parseItalianAmount } from "@/lib/money";
import { enqueueRun } from "@/worker/runs";

const path = (projectId: string) => `/projects/${projectId}/suppliers`;

async function linkOrThrow(linkId: string) {
  await requireUser();
  const link = await getDb().select().from(schema.supplierLinks).where(eq(schema.supplierLinks.id, linkId)).get();
  if (!link) throw new Error("Collegamento non trovato");
  return link;
}

export async function setLinkStatusAction(linkId: string, form: FormData) {
  const status = z.enum(schema.LINK_STATUSES).parse(form.get("status"));
  const link = await linkOrThrow(linkId);
  await getDb().update(schema.supplierLinks).set({ status }).where(eq(schema.supplierLinks.id, linkId)).run();
  revalidatePath(path(link.projectId));
}

/** Registra una chiamata o un'email; il primo contatto porta lo stato a "contattato". */
export async function logInteractionAction(linkId: string, form: FormData) {
  const link = await linkOrThrow(linkId);
  const channel = z.enum(["phone", "email", "whatsapp", "meeting", "other"]).parse(form.get("channel"));
  const outcome = String(form.get("outcome") ?? "").trim();
  const db = getDb();
  await db.insert(schema.supplierInteractions).values({ linkId, channel, outcome: outcome || null }).run();
  if (link.status === "to_contact") await db.update(schema.supplierLinks).set({ status: "contacted" }).where(eq(schema.supplierLinks.id, linkId)).run();
  revalidatePath(path(link.projectId));
}

/**
 * Prezzo e condizioni del fornitore. Con "usa nel preventivo" il costo della voce diventa quello
 * del fornitore (origine: preventivo fornitore) e il prezzo entra nel listino per i prossimi progetti.
 */
export async function saveSupplierQuoteAction(linkId: string, form: FormData) {
  const link = await linkOrThrow(linkId);
  const db = getDb();
  const cost = parseItalianAmount(String(form.get("cost") ?? ""));
  const includesVat = form.get("includesVat") === "on";
  const optionExpiresAt = String(form.get("optionExpiresAt") ?? "").trim() || null;
  const notes = String(form.get("notes") ?? "").trim() || null;
  const apply = form.get("apply") === "on";
  await db
    .update(schema.supplierLinks)
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
    const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, link.quoteLineId)).get();
    const quote = line ? await db.select().from(schema.quotes).where(eq(schema.quotes.id, line.quoteId)).get() : undefined;
    if (line && quote?.status === "draft") {
      const periods = line.periods > 0 ? line.periods : 1;
      const perUnit = line.pricingModel === "unit" || line.pricingModel === "per_pax";
      await db
        .update(schema.quoteLines)
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
    const project = await db.select().from(schema.projects).where(eq(schema.projects.id, link.projectId)).get();
    const supplier = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, link.supplierId)).get();
    await db
      .insert(schema.priceBenchmarks)
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
  await requireUser();
  const supplierId = String(form.get("supplierId") ?? "");
  if (!supplierId) return;
  const db = getDb();
  const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, quoteLineId)).get();
  await db
    .insert(schema.supplierLinks)
    .values({ id: newId("lnk"), projectId, quoteLineId, componentId: line?.componentId ?? null, supplierId, status: "to_contact" })
    .run();
  revalidatePath(path(projectId));
}

export async function removeLinkAction(linkId: string) {
  const link = await linkOrThrow(linkId);
  await getDb().delete(schema.supplierLinks).where(eq(schema.supplierLinks.id, linkId)).run();
  revalidatePath(path(link.projectId));
}

export async function searchSuppliersAction(projectId: string, quoteLineId: string) {
  await requireUser();
  await enqueueRun({ task: "supplier.search", projectId, input: { quoteLineId } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function draftRfqAction(linkId: string) {
  const link = await linkOrThrow(linkId);
  await enqueueRun({ task: "rfq.draft", projectId: link.projectId, input: { linkId } });
  revalidatePath(`/projects/${link.projectId}`, "layout");
}

const KIND_BY_PLATFORM_CATEGORY: Record<string, (typeof schema.SUPPLIER_KINDS)[number]> = {
  location: "venue",
  sale_allestimento: "venue",
  pernottamento: "hotel",
  catering: "catering",
  av_regia: "av",
  allestimenti: "staging",
  transfer: "transport",
  staff: "staff",
  intrattenimento: "entertainment",
  engagement: "experience",
  gadget: "gadget",
  comunicazione: "print",
};

/**
 * Fornitore trovato su una piattaforma: entra in rubrica (con la piattaforma come fonte) e si collega
 * alla voce. Il telefono scritto a mano resta "da verificare" finché non lo si conferma chiamando.
 */
export async function addPlatformSupplierAction(projectId: string, quoteLineId: string, form: FormData) {
  await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) throw new Error("Scrivi il nome del fornitore");
  const db = getDb();
  const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, quoteLineId)).get();
  if (!line) throw new Error("Voce non trovata");
  const component = line.componentId ? await db.select().from(schema.components).where(eq(schema.components.id, line.componentId)).get() : undefined;
  const platformId = String(form.get("platformId") ?? "") || null;
  const platform = platformId ? await db.select().from(schema.platforms).where(eq(schema.platforms.id, platformId)).get() : undefined;
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();

  const rawSite = String(form.get("website") ?? "").trim();
  let website: string | null = null;
  let domain: string | null = null;
  if (rawSite) {
    try {
      const url = new URL(/^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`);
      website = url.origin;
      domain = url.hostname.replace(/^www\./, "");
    } catch {
      throw new Error("Sito non valido");
    }
  }
  // stesso dominio già in rubrica: si collega quello, senza doppioni
  const existing = domain ? await db.select().from(schema.suppliers).where(eq(schema.suppliers.domain, domain)).get() : undefined;
  const specKind = (component?.specs as { supplierKind?: string } | null)?.supplierKind as (typeof schema.SUPPLIER_KINDS)[number] | undefined;
  const supplierId = existing?.id ?? newId("sup");
  const contact = String(form.get("contact") ?? "").trim();
  const email = extractEmails(contact)[0]?.value;
  const phone = email ? null : contact ? normalizePhone(contact) : null;
  if (contact && !email && !phone) throw new Error("Telefono o email non validi");
  const calledOk = form.get("calledOk") === "on";
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    if (!existing) {
      await tx
        .insert(schema.suppliers)
        .values({
          id: supplierId,
          name,
          kind: specKind ?? KIND_BY_PLATFORM_CATEGORY[component?.category ?? ""] ?? "other",
          city: project?.city ?? null,
          website,
          domain,
          source: platform ? "platform" : "manual",
          platformId: platform?.id ?? null,
          notes: platform ? `Trovato su ${platform.name} per ${project?.code ?? "un progetto"}.` : null,
        })
        .run();
    }
    if (email) {
      await tx
        .insert(schema.supplierContacts)
        .values({ id: newId("cnt"), supplierId, type: "email", value: email, display: email, status: "to_verify", verificationMethod: "manual_entry" })
        .onConflictDoNothing()
        .run();
    }
    if (phone) {
      await tx
        .insert(schema.supplierContacts)
        .values({
          id: newId("cnt"),
          supplierId,
          type: phoneType(phone),
          value: phone,
          display: formatPhoneDisplay(phone),
          status: calledOk ? "verified" : "to_verify",
          verificationMethod: calledOk ? "manual_call" : "manual_entry",
          verifiedAt: calledOk ? now : null,
        })
        .onConflictDoNothing()
        .run();
    }
    const already = (await tx.select().from(schema.supplierLinks).where(eq(schema.supplierLinks.quoteLineId, line.id)).all()).some((l) => l.supplierId === supplierId);
    if (!already) {
      await tx
        .insert(schema.supplierLinks)
        .values({
          id: newId("lnk"),
          projectId,
          quoteLineId: line.id,
          componentId: line.componentId,
          category: component?.category ?? null,
          supplierId,
          status: "to_contact",
          notes: platform ? `Trovato su ${platform.name}` : null,
        })
        .run();
    }
  });
  revalidatePath(path(projectId));
}
