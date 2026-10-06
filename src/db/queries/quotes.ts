import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nextCounter } from "@/db/queries/projects";
import { computeQuote, type QuoteLineInput, type QuoteSectionInput, type VatRegime } from "@/domain/quote/engine";
import { newId } from "@/lib/ids";
import { getSetting } from "@/lib/settings";

export type QuoteRow = typeof schema.quotes.$inferSelect;
export type QuoteLineRow = typeof schema.quoteLines.$inferSelect;
export type QuoteSectionRow = typeof schema.quoteSections.$inferSelect;

export const listVatRegimes = async (): Promise<VatRegime[]> =>
  (await getDb().select().from(schema.vatRegimes).orderBy(asc(schema.vatRegimes.position)).all()).map((r) => ({
    code: r.code,
    label: r.label,
    kind: r.kind,
    rateBp: r.rateBp,
    invoiceNote: r.invoiceNote,
    allowMarkup: r.allowMarkup,
  }));

export function quotesForProject(projectId: string) {
  return getDb()
    .select()
    .from(schema.quotes)
    .where(eq(schema.quotes.projectId, projectId))
    .orderBy(desc(schema.quotes.createdAt))
    .all();
}

/** Il preventivo "corrente" del progetto: l'ultima revisione non sostituita. */
export async function currentQuote(projectId: string) {
  const quotes = await quotesForProject(projectId);
  return quotes.find((q) => q.status !== "superseded") ?? quotes[0];
}

export async function getQuoteFull(quoteId: string) {
  const db = getDb();
  const quote = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId)).get();
  if (!quote) return null;
  const [sections, lines, regimes] = await Promise.all([
    db.select().from(schema.quoteSections).where(eq(schema.quoteSections.quoteId, quoteId)).orderBy(asc(schema.quoteSections.position)).all(),
    db.select().from(schema.quoteLines).where(eq(schema.quoteLines.quoteId, quoteId)).orderBy(asc(schema.quoteLines.position)).all(),
    listVatRegimes(),
  ]);
  return { quote, sections, lines, regimes };
}

export const toEngineLine = (l: QuoteLineRow): QuoteLineInput => ({
  id: l.id,
  sectionId: l.sectionId,
  description: l.description,
  quantity: l.quantity,
  periods: l.periods,
  pricingModel: l.pricingModel,
  unitCostCents: l.unitCostCents,
  fixedCostCents: l.fixedCostCents,
  includedQuantity: l.includedQuantity,
  extraUnitCostCents: l.extraUnitCostCents,
  percentBp: l.percentBp,
  percentOfLineIds: l.percentOfLineIds,
  costIncludesVat: l.costIncludesVat,
  supplierVatRateBp: l.supplierVatRateBp,
  markupBp: l.markupBp,
  priceOverrideCents: l.priceOverrideCents,
  vatRegimeCode: l.vatRegimeCode,
  optional: l.optional,
  costSource: l.costSource,
  estimateMinCents: l.estimateMinCents,
  estimateMaxCents: l.estimateMaxCents,
});

export const toEngineSection = (s: QuoteSectionRow): QuoteSectionInput => ({
  id: s.id,
  title: s.title,
  position: s.position,
  optional: s.optional,
});

export function quoteSettings(q: QuoteRow) {
  return {
    agencyFeeBp: q.agencyFeeBp,
    agencyFeeVatRegime: q.agencyFeeVatRegime,
    contingencyBp: q.contingencyBp,
    contingencyMode: q.contingencyMode,
    rounding: q.rounding,
    paymentTranches: q.paymentTranches ?? [],
  };
}

export async function computeForQuote(quoteId: string) {
  const full = await getQuoteFull(quoteId);
  if (!full) return null;
  return {
    ...full,
    totals: computeQuote({
      sections: full.sections.map(toEngineSection),
      lines: full.lines.map(toEngineLine),
      regimes: full.regimes,
      settings: quoteSettings(full.quote),
    }),
  };
}

export async function createQuote(projectId: string, title: string, sectionTitles: string[] = []) {
  const db = getDb();
  const defaults = await getSetting("quote.defaults");
  const year = new Date().getFullYear();
  const n = await nextCounter(`quote-${year}`);
  const id = newId("quo");
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.quotes)
      .values({
        id,
        projectId,
        number: `PRV-${year}-${String(n).padStart(3, "0")}`,
        revision: 1,
        title,
        date: new Date().toISOString().slice(0, 10),
        validityDays: defaults.validityDays,
        agencyFeeBp: defaults.agencyFeeBp,
        contingencyBp: defaults.contingencyBp,
        contingencyMode: defaults.contingencyMode,
        paymentTranches: defaults.paymentTranches,
        notes: defaults.notes,
      })
      .run();
    if (sectionTitles.length) {
      await tx
        .insert(schema.quoteSections)
        .values(sectionTitles.map((t, i) => ({ id: newId("qsc"), quoteId: id, position: i + 1, title: t })))
        .run();
    }
  });
  return id;
}

/** Nuova revisione: copia profonda, la precedente diventa "sostituita". */
export async function newRevision(quoteId: string) {
  const db = getDb();
  const full = await getQuoteFull(quoteId);
  if (!full) throw new Error("Preventivo non trovato");
  const id = newId("quo");
  const latest = await db
    .select({ r: schema.quotes.revision })
    .from(schema.quotes)
    .where(eq(schema.quotes.number, full.quote.number))
    .orderBy(desc(schema.quotes.revision))
    .get();
  const latestRev = latest?.r ?? full.quote.revision;
  await db.transaction(async (tx) => {
    const { id: _id, createdAt: _c, sentAt: _s, snapshot: _snap, ...rest } = full.quote;
    await tx.insert(schema.quotes).values({ ...rest, id, revision: latestRev + 1, status: "draft", date: new Date().toISOString().slice(0, 10) }).run();
    const sectionMap = new Map(full.sections.map((s) => [s.id, newId("qsc")]));
    if (full.sections.length) {
      await tx
        .insert(schema.quoteSections)
        .values(full.sections.map((s) => ({ ...s, id: sectionMap.get(s.id)!, quoteId: id })))
        .run();
    }
    const lineMap = new Map(full.lines.map((l) => [l.id, newId("qln")]));
    if (full.lines.length) {
      await tx
        .insert(schema.quoteLines)
        .values(
          full.lines.map((l) => ({
            ...l,
            id: lineMap.get(l.id)!,
            quoteId: id,
            sectionId: sectionMap.get(l.sectionId)!,
            percentOfLineIds: l.percentOfLineIds?.map((x) => lineMap.get(x) ?? x) ?? null,
          })),
        )
        .run();
    }
    await tx.update(schema.quotes).set({ status: "superseded" }).where(eq(schema.quotes.id, quoteId)).run();
  });
  return id;
}

export async function deleteLines(ids: string[]) {
  if (!ids.length) return;
  await getDb().delete(schema.quoteLines).where(inArray(schema.quoteLines.id, ids)).run();
}

export async function lineCountBySection(quoteId: string, sectionId: string) {
  const rows = await getDb()
    .select({ id: schema.quoteLines.id })
    .from(schema.quoteLines)
    .where(and(eq(schema.quoteLines.quoteId, quoteId), eq(schema.quoteLines.sectionId, sectionId)))
    .all();
  return rows.length;
}
