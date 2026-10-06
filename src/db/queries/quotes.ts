import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nextCounter } from "@/db/queries/projects";
import { computeQuote, type QuoteLineInput, type QuoteSectionInput, type VatRegime } from "@/domain/quote/engine";
import { newId } from "@/lib/ids";
import { getSetting } from "@/lib/settings";

export type QuoteRow = typeof schema.quotes.$inferSelect;
export type QuoteLineRow = typeof schema.quoteLines.$inferSelect;
export type QuoteSectionRow = typeof schema.quoteSections.$inferSelect;

export const listVatRegimes = (): VatRegime[] =>
  getDb()
    .select()
    .from(schema.vatRegimes)
    .orderBy(asc(schema.vatRegimes.position))
    .all()
    .map((r) => ({ code: r.code, label: r.label, kind: r.kind, rateBp: r.rateBp, invoiceNote: r.invoiceNote, allowMarkup: r.allowMarkup }));

export function quotesForProject(projectId: string) {
  return getDb()
    .select()
    .from(schema.quotes)
    .where(eq(schema.quotes.projectId, projectId))
    .orderBy(desc(schema.quotes.createdAt))
    .all();
}

/** Il preventivo "corrente" del progetto: l'ultima revisione non sostituita. */
export function currentQuote(projectId: string) {
  return quotesForProject(projectId).find((q) => q.status !== "superseded") ?? quotesForProject(projectId)[0];
}

export function getQuoteFull(quoteId: string) {
  const db = getDb();
  const quote = db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId)).get();
  if (!quote) return null;
  const sections = db
    .select()
    .from(schema.quoteSections)
    .where(eq(schema.quoteSections.quoteId, quoteId))
    .orderBy(asc(schema.quoteSections.position))
    .all();
  const lines = db
    .select()
    .from(schema.quoteLines)
    .where(eq(schema.quoteLines.quoteId, quoteId))
    .orderBy(asc(schema.quoteLines.position))
    .all();
  return { quote, sections, lines, regimes: listVatRegimes() };
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

export function computeForQuote(quoteId: string) {
  const full = getQuoteFull(quoteId);
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

export function createQuote(projectId: string, title: string, sectionTitles: string[] = []) {
  const db = getDb();
  const defaults = getSetting("quote.defaults");
  const year = new Date().getFullYear();
  const n = nextCounter(`quote-${year}`);
  const id = newId("quo");
  db.transaction((tx) => {
    tx.insert(schema.quotes)
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
    sectionTitles.forEach((t, i) =>
      tx.insert(schema.quoteSections).values({ id: newId("qsc"), quoteId: id, position: i + 1, title: t }).run(),
    );
  });
  return id;
}

/** Nuova revisione: copia profonda, la precedente diventa "sostituita". */
export function newRevision(quoteId: string) {
  const db = getDb();
  const full = getQuoteFull(quoteId);
  if (!full) throw new Error("Preventivo non trovato");
  const id = newId("quo");
  const latestRev = db
    .select({ r: schema.quotes.revision })
    .from(schema.quotes)
    .where(eq(schema.quotes.number, full.quote.number))
    .orderBy(desc(schema.quotes.revision))
    .get()!.r;
  db.transaction((tx) => {
    const { id: _id, createdAt: _c, sentAt: _s, snapshot: _snap, ...rest } = full.quote;
    tx.insert(schema.quotes).values({ ...rest, id, revision: latestRev + 1, status: "draft", date: new Date().toISOString().slice(0, 10) }).run();
    const sectionMap = new Map<string, string>();
    for (const s of full.sections) {
      const sid = newId("qsc");
      sectionMap.set(s.id, sid);
      tx.insert(schema.quoteSections).values({ ...s, id: sid, quoteId: id }).run();
    }
    const lineMap = new Map(full.lines.map((l) => [l.id, newId("qln")]));
    for (const l of full.lines) {
      tx.insert(schema.quoteLines)
        .values({
          ...l,
          id: lineMap.get(l.id)!,
          quoteId: id,
          sectionId: sectionMap.get(l.sectionId)!,
          percentOfLineIds: l.percentOfLineIds?.map((x) => lineMap.get(x) ?? x) ?? null,
        })
        .run();
    }
    tx.update(schema.quotes).set({ status: "superseded" }).where(eq(schema.quotes.id, quoteId)).run();
  });
  return id;
}

export function deleteLines(ids: string[]) {
  if (!ids.length) return;
  getDb().delete(schema.quoteLines).where(inArray(schema.quoteLines.id, ids)).run();
}

export function lineCountBySection(quoteId: string, sectionId: string) {
  return getDb()
    .select({ id: schema.quoteLines.id })
    .from(schema.quoteLines)
    .where(and(eq(schema.quoteLines.quoteId, quoteId), eq(schema.quoteLines.sectionId, sectionId)))
    .all().length;
}
