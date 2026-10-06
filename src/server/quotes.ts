"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { computeForQuote, createQuote, currentQuote, newRevision } from "@/db/queries/quotes";
import { planQuoteFromComponents } from "@/domain/quote/from-components";
import { proposeArchiveSuppliers } from "@/domain/suppliers/propose";
import { newId } from "@/lib/ids";
import { percentToBp } from "@/lib/money";

const quotePath = (projectId: string) => `/projects/${projectId}/quote`;

async function projectOfQuote(quoteId: string) {
  const q = await getDb().select({ projectId: schema.quotes.projectId }).from(schema.quotes).where(eq(schema.quotes.id, quoteId)).get();
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
  await requireUser();
  const project = await getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return;
  await createQuote(projectId, `Preventivo ${project.title}`, DEFAULT_SECTIONS);
  await getDb().update(schema.projects).set({ status: "preventivo" }).where(eq(schema.projects.id, projectId)).run();
  revalidatePath(quotePath(projectId), "layout");
}

export async function newRevisionAction(quoteId: string) {
  await requireUser();
  const projectId = await projectOfQuote(quoteId);
  await newRevision(quoteId);
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
  await requireUser();
  const s = SettingsInput.parse(Object.fromEntries(form));
  await getDb()
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
  revalidatePath(quotePath(await projectOfQuote(quoteId)));
}

export async function addSectionAction(quoteId: string, form: FormData) {
  await requireUser();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const db = getDb();
  const pos =
    (await db.select({ p: max(schema.quoteSections.position) }).from(schema.quoteSections).where(eq(schema.quoteSections.quoteId, quoteId)).get())?.p ?? 0;
  await db
    .insert(schema.quoteSections)
    .values({ id: newId("qsc"), quoteId, position: pos + 1, title, optional: form.get("optional") === "on" })
    .run();
  revalidatePath(quotePath(await projectOfQuote(quoteId)));
}

export async function updateSectionAction(sectionId: string, patch: { title?: string; optional?: boolean }) {
  await requireUser();
  const db = getDb();
  const s = await db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  if (!s) return;
  await db
    .update(schema.quoteSections)
    .set({ ...(patch.title?.trim() ? { title: patch.title.trim() } : {}), ...(patch.optional != null ? { optional: patch.optional } : {}) })
    .where(eq(schema.quoteSections.id, sectionId))
    .run();
  revalidatePath(quotePath(await projectOfQuote(s.quoteId)));
}

export async function deleteSectionAction(sectionId: string) {
  await requireUser();
  const db = getDb();
  const s = await db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  if (!s) return;
  await db.delete(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).run();
  revalidatePath(quotePath(await projectOfQuote(s.quoteId)));
}

export async function moveSectionAction(sectionId: string, direction: -1 | 1) {
  await requireUser();
  const db = getDb();
  const s = await db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  if (!s) return;
  const siblings = (await db.select().from(schema.quoteSections).where(eq(schema.quoteSections.quoteId, s.quoteId)).all()).sort(
    (a, b) => a.position - b.position,
  );
  const idx = siblings.findIndex((x) => x.id === sectionId);
  const other = siblings[idx + direction];
  if (!other) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.quoteSections).set({ position: other.position }).where(eq(schema.quoteSections.id, s.id)).run();
    await tx.update(schema.quoteSections).set({ position: s.position }).where(eq(schema.quoteSections.id, other.id)).run();
  });
  revalidatePath(quotePath(await projectOfQuote(s.quoteId)));
}

/** Nuova voce in una sezione, con il regime IVA e il ricarico di default della categoria. */
export async function addLineAction(quoteId: string, sectionId: string) {
  await requireUser();
  const db = getDb();
  const section = await db.select().from(schema.quoteSections).where(eq(schema.quoteSections.id, sectionId)).get();
  const category = section
    ? await db.select().from(schema.checklistItems).where(eq(schema.checklistItems.defaultSection, section.title)).get()
    : undefined;
  const pos =
    (
      await db
        .select({ p: max(schema.quoteLines.position) })
        .from(schema.quoteLines)
        .where(and(eq(schema.quoteLines.quoteId, quoteId), eq(schema.quoteLines.sectionId, sectionId)))
        .get()
    )?.p ?? 0;
  const id = newId("qln");
  await db
    .insert(schema.quoteLines)
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
  revalidatePath(quotePath(await projectOfQuote(quoteId)));
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
  await requireUser();
  const data = LinePatch.parse(patch);
  // un costo toccato a mano non è più una stima
  if ((data.unitCostCents != null || data.fixedCostCents != null) && !data.costSource) data.costSource = "manual";
  await getDb().update(schema.quoteLines).set(data).where(eq(schema.quoteLines.id, lineId)).run();
  return { ok: true, costSource: data.costSource };
}

export async function deleteLineAction(lineId: string) {
  await requireUser();
  const db = getDb();
  const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).get();
  if (!line) return;
  await db.delete(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).run();
  revalidatePath(quotePath(await projectOfQuote(line.quoteId)));
}

export async function duplicateLineAction(lineId: string) {
  await requireUser();
  const db = getDb();
  const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).get();
  if (!line) return;
  await db.insert(schema.quoteLines).values({ ...line, id: newId("qln"), position: line.position + 0.5, description: `${line.description} (copia)` }).run();
  revalidatePath(quotePath(await projectOfQuote(line.quoteId)));
}

export async function moveLineAction(lineId: string, sectionId: string) {
  await requireUser();
  const db = getDb();
  const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, lineId)).get();
  if (!line) return;
  await db.update(schema.quoteLines).set({ sectionId, position: 9999 }).where(eq(schema.quoteLines.id, lineId)).run();
  revalidatePath(quotePath(await projectOfQuote(line.quoteId)));
}

/** Congela il preventivo all'invio: la fotografia dei totali resta com'era. */
export async function markSentAction(quoteId: string) {
  await requireUser();
  const computed = await computeForQuote(quoteId);
  if (!computed) return;
  await getDb()
    .update(schema.quotes)
    .set({ status: "sent", sentAt: new Date().toISOString(), snapshot: { totals: computed.totals, lines: computed.lines, sections: computed.sections } as Record<string, unknown> })
    .where(eq(schema.quotes.id, quoteId))
    .run();
  await getDb().update(schema.projects).set({ status: "inviata" }).where(eq(schema.projects.id, computed.quote.projectId)).run();
  revalidatePath(quotePath(computed.quote.projectId), "layout");
}

export async function openQuoteRevision(projectId: string, quoteId: string) {
  await requireUser();
  redirect(`${quotePath(projectId)}?q=${quoteId}`);
}

/**
 * Preventivo dai componenti dei moduli. Se esiste già un preventivo, si crea una nuova
 * revisione: la precedente resta consultabile.
 */
export async function generateQuoteFromComponentsAction(projectId: string) {
  await requireUser();
  const db = getDb();
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return;
  const components = await db.select().from(schema.components).where(eq(schema.components.projectId, projectId)).all();
  if (!components.length) throw new Error("Nessun componente: sviluppa prima i moduli della proposta");
  const checklist = await db.select().from(schema.checklistItems).all();
  const plan = planQuoteFromComponents(
    components.map((c) => ({ ...c, specs: c.specs as never })),
    checklist,
  );

  const current = await currentQuote(projectId);
  const quoteId = current ? await newRevision(current.id) : await createQuote(projectId, `Preventivo ${project.title}`);
  await db.transaction(async (tx) => {
    await tx.delete(schema.quoteSections).where(eq(schema.quoteSections.quoteId, quoteId)).run();
    const sectionIds = new Map(plan.sections.map((s) => [s.title, newId("qsc")]));
    if (plan.sections.length) {
      await tx
        .insert(schema.quoteSections)
        .values(plan.sections.map((s) => ({ id: sectionIds.get(s.title)!, quoteId, position: s.position, title: s.title })))
        .run();
    }
    if (plan.lines.length) {
      await tx
        .insert(schema.quoteLines)
        .values(plan.lines.map(({ sectionTitle, ...line }) => ({ id: newId("qln"), quoteId, sectionId: sectionIds.get(sectionTitle)!, ...line })))
        .run();
    }
  });
  await proposeArchiveSuppliers(projectId, quoteId);
  await db.update(schema.projects).set({ status: "preventivo" }).where(eq(schema.projects.id, projectId)).run();
  revalidatePath(quotePath(projectId), "layout");
}
