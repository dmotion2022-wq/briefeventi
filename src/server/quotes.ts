"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { computeForQuote, createQuote, currentQuote, newRevision } from "@/db/queries/quotes";
import { planQuoteFromComponents } from "@/domain/quote/from-components";
import { proposeArchiveSuppliers } from "@/domain/suppliers/propose";
import { newId } from "@/lib/ids";
import { percentToBp } from "@/lib/money";

const quotePath = (projectId: string) => `/projects/${projectId}/quote`;

function projectOfQuote(quoteId: string) {
  const q = getDb().select({ projectId: schema.quotes.projectId }).from(schema.quotes).where(eq(schema.quotes.id, quoteId)).get();
  if (!q) throw new Error("Preventivo non trovato");
  return q.projectId;
}

/** Sezioni di partenza: quelle della checklist, nell'ordine dell'evento. */
const DEFAULT_SECTIONS = [
  "Location e sale",
  "Ospitalità",
  "Food & beverage",
  "Trasporti",
  "Produzione tecnica",
  "Allestimenti",
  "Creatività e comunicazione",
  "Esperienza ed engagement",
  "Staff e servizi",
  "Segreteria e accrediti",
  "Sicurezza e permessi",
  "Management",
];

export async function createQuoteAction(projectId: string) {
  const project = getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return;
  createQuote(projectId, `Preventivo ${project.title}`, DEFAULT_SECTIONS);
  getDb().update(schema.projects).set({ status: "preventivo" }).where(eq(schema.projects.id, projectId)).run();
  revalidatePath(quotePath(projectId), "layout");
}

export async function newRevisionAction(quoteId: string) {
  const projectId = projectOfQuote(quoteId);
  newRevision(quoteId);
  revalidatePath(quotePath(projectId), "layout");
}

const SettingsInput = z.object({
  title: z.string().trim().min(1),
  date: z.string().min(8),
  validityDays: z.coerce.number().int().min(1).max(365),
  agencyFeePercent: z.coerce.number().min(0).max(100),
  contingencyPercent: z.coerce.number().min(0).max(100),
  contingencyMode: z.enum(["internal", "client_line"]),
  rounding: z.enum(["none", "unit_1", "unit_10"]),
  tranches: z.string(),
  notes: z.string(),
});

/** Tranche scritte una per riga: "Acconto alla conferma: 50". */
function parseTranches(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)[:=\-–]\s*([\d.,]+)\s*%?\s*$/);
      if (!m) throw new Error(`Tranche non leggibile: "${l}" (scrivi "Descrizione: percentuale")`);
      return { label: m[1].trim(), percentBp: percentToBp(Number(m[2].replace(",", "."))) };
    });
}

export async function updateQuoteSettingsAction(quoteId: string, form: FormData) {
  const s = SettingsInput.parse(Object.fromEntries(form));
  getDb()
    .update(schema.quotes)
    .set({
      title: s.title,
      date: s.date,
      validityDays: s.validityDays,
      agencyFeeBp: percentToBp(s.agencyFeePercent),
      contingencyBp: percentToBp(s.contingencyPercent),
      contingencyMode: s.contingencyMode,
      rounding: s.rounding,
      paymentTranches: parseTranches(s.tranches),
      notes: s.notes
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean),
    })
    .where(eq(schema.quotes.id, quoteId))
    .run();
  revalidatePath(quotePath(projectOfQuote(quoteId)));
}

export async function addSectionAction(quoteId: string, form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const db = getDb();
  const pos = db.select({ p: max(schema.quoteSections.position) }).from(schema.quoteSections).where(eq(schema.quoteSections.quoteId, quoteId)).get()?.p ?? 0;
  db.insert(schema.quoteSections)
    .values({ id: newId("qsc"), quoteId, position: pos + 1, title, optional: form.get("optional") === "on" })
    .run();
  revalidatePath(quotePath(projectOfQuote(quoteId)));
}

export async function updateSectionAction(sectionId: string, patch: { title?: string; optional?: boolean }) {
  const db = getDb();
  const s = db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  if (!s) return;
  db.update(schema.quoteSections)
    .set({ ...(patch.title?.trim() ? { title: patch.title.trim() } : {}), ...(patch.optional != null ? { optional: patch.optional } : {}) })
    .where(eq(schema.quoteSections.id, sectionId))
    .run();
  revalidatePath(quotePath(projectOfQuote(s.quoteId)));
}

export async function deleteSectionAction(sectionId: string) {
  const db = getDb();
  const s = db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  if (!s) return;
  db.delete(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).run();
  revalidatePath(quotePath(projectOfQuote(s.quoteId)));
}

export async function moveSectionAction(sectionId: string, direction: -1 | 1) {
  const db = getDb();
  const s = db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  if (!s) return;
  const siblings = db.select().from(schema.quoteSections).where(eq(schema.quoteSections.quoteId, s.quoteId)).all().sort((a, b) => a.position - b.position);
  const idx = siblings.findIndex((x) => x.id === sectionId);
  const other = siblings[idx + direction];
  if (!other) return;
  db.transaction((tx) => {
    tx.update(schema.quoteSections).set({ position: other.position }).where(eq(schema.quoteSections.id, s.id)).run();
    tx.update(schema.quoteSections).set({ position: s.position }).where(eq(schema.quoteSections.id, other.id)).run();
  });
  revalidatePath(quotePath(projectOfQuote(s.quoteId)));
}

/** Nuova voce in una sezione, con il regime IVA e il ricarico di default della categoria. */
export async function addLineAction(quoteId: string, sectionId: string) {
  const db = getDb();
  const section = db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  const category = section
    ? db.select().from(schema.checklistItems).where(eq(schema.checklistItems.defaultSection, section.title)).get()
    : undefined;
  const pos =
    db.select({ p: max(schema.quoteLines.position) }).from(schema.quoteLines).where(and(eq(schema.quoteLines.quoteId, quoteId), eq(schema.quoteLines.sectionId, sectionId))).get()?.p ?? 0;
  const id = newId("qln");
  db.insert(schema.quoteLines)
    .values({
      id,
      quoteId,
      sectionId,
      position: pos + 1,
      description: "Nuova voce",
      vatRegimeCode: category?.defaultVatRegime ?? "IVA22",
      supplierVatRateBp: category?.defaultVatRegime === "IVA10" ? 1000 : 2200,
      markupBp: category?.defaultMarkupBp ?? 1500,
      costSource: "manual",
    })
    .run();
  revalidatePath(quotePath(projectOfQuote(quoteId)));
  return id;
}

const LinePatch = z
  .object({
    description: z.string().trim().min(1),
    detail: z.string().nullable(),
    quantity: z.number().min(0),
    unit: z.string(),
    periods: z.number().min(0),
    periodUnit: z.enum(schema.PERIOD_UNITS),
    pricingModel: z.enum(schema.PRICING_MODELS),
    unitCostCents: z.number().int(),
    fixedCostCents: z.number().int(),
    includedQuantity: z.number().nullable(),
    extraUnitCostCents: z.number().int().nullable(),
    percentBp: z.number().int().nullable(),
    percentOfLineIds: z.array(z.string()).nullable(),
    costIncludesVat: z.boolean(),
    supplierVatRateBp: z.number().int(),
    markupBp: z.number().int(),
    priceOverrideCents: z.number().int().nullable(),
    vatRegimeCode: z.string(),
    optional: z.boolean(),
    costSource: z.enum(schema.COST_SOURCES),
    notes: z.string().nullable(),
  })
  .partial();

/** Salvataggio automatico di una voce dall'editor (i totali si ricalcolano già nel browser). */
export async function saveLineAction(lineId: string, patch: z.infer<typeof LinePatch>) {
  const data = LinePatch.parse(patch);
  // un costo toccato a mano non è più una stima
  if ((data.unitCostCents != null || data.fixedCostCents != null) && !data.costSource) data.costSource = "manual";
  getDb().update(schema.quoteLines).set(data).where(eq(schema.quoteLines.id, lineId)).run();
  return { ok: true, costSource: data.costSource };
}

export async function deleteLineAction(lineId: string) {
  const db = getDb();
  const line = db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).get();
  if (!line) return;
  db.delete(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).run();
  revalidatePath(quotePath(projectOfQuote(line.quoteId)));
}

export async function duplicateLineAction(lineId: string) {
  const db = getDb();
  const line = db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).get();
  if (!line) return;
  db.insert(schema.quoteLines).values({ ...line, id: newId("qln"), position: line.position + 0.5, description: `${line.description} (copia)` }).run();
  revalidatePath(quotePath(projectOfQuote(line.quoteId)));
}

export async function moveLineAction(lineId: string, sectionId: string) {
  const db = getDb();
  const line = db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).get();
  if (!line) return;
  db.update(schema.quoteLines).set({ sectionId, position: 9999 }).where(eq(schema.quoteLines.id, lineId)).run();
  revalidatePath(quotePath(projectOfQuote(line.quoteId)));
}

/** Congela il preventivo all'invio: la fotografia dei totali resta com'era. */
export async function markSentAction(quoteId: string) {
  const computed = computeForQuote(quoteId);
  if (!computed) return;
  getDb()
    .update(schema.quotes)
    .set({ status: "sent", sentAt: new Date().toISOString(), snapshot: { totals: computed.totals, lines: computed.lines, sections: computed.sections } as Record<string, unknown> })
    .where(eq(schema.quotes.id, quoteId))
    .run();
  getDb().update(schema.projects).set({ status: "inviata" }).where(eq(schema.projects.id, computed.quote.projectId)).run();
  revalidatePath(quotePath(computed.quote.projectId), "layout");
}

export async function openQuoteRevision(projectId: string, quoteId: string) {
  redirect(`${quotePath(projectId)}?q=${quoteId}`);
}

/**
 * Preventivo dai componenti dei moduli. Se esiste già un preventivo, si crea una nuova
 * revisione: la precedente resta consultabile.
 */
export async function generateQuoteFromComponentsAction(projectId: string) {
  const db = getDb();
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return;
  const components = db.select().from(schema.components).where(eq(schema.components.projectId, projectId)).all();
  if (!components.length) throw new Error("Nessun componente: sviluppa prima i moduli della proposta");
  const checklist = db.select().from(schema.checklistItems).all();
  const plan = planQuoteFromComponents(
    components.map((c) => ({ ...c, specs: c.specs as never })),
    checklist,
  );

  const current = currentQuote(projectId);
  const quoteId = current ? newRevision(current.id) : createQuote(projectId, `Preventivo ${project.title}`);
  db.transaction((tx) => {
    tx.delete(schema.quoteSections).where(eq(schema.quoteSections.quoteId, quoteId)).run();
    const sectionIds = new Map<string, string>();
    for (const s of plan.sections) {
      const id = newId("qsc");
      sectionIds.set(s.title, id);
      tx.insert(schema.quoteSections).values({ id, quoteId, position: s.position, title: s.title }).run();
    }
    for (const l of plan.lines) {
      const { sectionTitle, ...line } = l;
      tx.insert(schema.quoteLines).values({ id: newId("qln"), quoteId, sectionId: sectionIds.get(sectionTitle)!, ...line }).run();
    }
  });
  proposeArchiveSuppliers(projectId, quoteId);
  db.update(schema.projects).set({ status: "preventivo" }).where(eq(schema.projects.id, projectId)).run();
  revalidatePath(quotePath(projectId), "layout");
}
