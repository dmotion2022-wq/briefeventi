// Dai componenti dei moduli alle voci del preventivo: mappatura deterministica (niente AI).
// Sezione, regime IVA e ricarico vengono dalla checklist; il costo è la stima del modulo,
// segnalata come "stima AI" con la sua forchetta finché un fornitore non conferma.

export type ChecklistDefaults = { key: string; defaultSection: string; defaultVatRegime: string; defaultMarkupBp: number; position: number };

export type ComponentForQuote = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  quantityHint: number | null;
  unitHint: string | null;
  periodsHint: number | null;
  pricingModelHint: "unit" | "per_pax" | "forfait" | "package" | "percent" | null;
  optional: boolean;
  specs: {
    periodUnit?: "none" | "hour" | "day" | "night";
    estimate?: { unitCostCents: number | null; fixedCostCents: number | null; minCents: number; maxCents: number; basis: string };
  } | null;
};

export type PlannedSection = { title: string; position: number };
export type PlannedLine = {
  componentId: string;
  sectionTitle: string;
  position: number;
  description: string;
  detail: string | null;
  quantity: number;
  unit: string;
  periods: number;
  periodUnit: "none" | "hour" | "day" | "night";
  pricingModel: "unit" | "per_pax" | "forfait" | "package" | "percent";
  unitCostCents: number;
  fixedCostCents: number;
  supplierVatRateBp: number;
  markupBp: number;
  vatRegimeCode: string;
  optional: boolean;
  costSource: "ai_estimate";
  estimateMinCents: number | null;
  estimateMaxCents: number | null;
  notes: string | null;
};

const FALLBACK: Omit<ChecklistDefaults, "key"> = { defaultSection: "Altri servizi", defaultVatRegime: "IVA22", defaultMarkupBp: 1500, position: 999 };

export function planQuoteFromComponents(components: ComponentForQuote[], checklist: ChecklistDefaults[]) {
  const byKey = new Map(checklist.map((c) => [c.key, c]));
  const sectionOrder = new Map<string, number>();
  for (const c of [...checklist].sort((a, b) => a.position - b.position)) {
    if (!sectionOrder.has(c.defaultSection)) sectionOrder.set(c.defaultSection, sectionOrder.size + 1);
  }

  const lines: PlannedLine[] = [];
  const counters = new Map<string, number>();
  for (const comp of components) {
    const rules = byKey.get(comp.category) ?? { key: comp.category, ...FALLBACK };
    const section = rules.defaultSection;
    if (!sectionOrder.has(section)) sectionOrder.set(section, sectionOrder.size + 1);
    const est = comp.specs?.estimate;
    const model = comp.pricingModelHint ?? "forfait";
    const quantity = comp.quantityHint && comp.quantityHint > 0 ? comp.quantityHint : 1;
    const periods = comp.periodsHint && comp.periodsHint > 0 ? comp.periodsHint : 1;

    // se manca il dato principale, si ricava dal centro della forchetta
    const mid = est ? Math.round((est.minCents + est.maxCents) / 2) : 0;
    let unitCost = est?.unitCostCents ?? 0;
    let fixedCost = est?.fixedCostCents ?? 0;
    if ((model === "unit" || model === "per_pax") && !unitCost && mid) unitCost = Math.round(mid / (quantity * periods));
    if ((model === "forfait" || model === "package") && !fixedCost && mid) fixedCost = Math.round(mid / periods);

    const position = (counters.get(section) ?? 0) + 1;
    counters.set(section, position);
    lines.push({
      componentId: comp.id,
      sectionTitle: section,
      position,
      description: comp.title,
      detail: comp.description,
      quantity: model === "forfait" || model === "percent" ? 1 : quantity,
      unit: comp.unitHint || "n.",
      periods,
      periodUnit: comp.specs?.periodUnit ?? "none",
      pricingModel: model === "percent" ? "forfait" : model,
      unitCostCents: unitCost,
      fixedCostCents: fixedCost,
      supplierVatRateBp: rules.defaultVatRegime === "IVA10" ? 1000 : rules.defaultVatRegime === "IVA4" ? 400 : 2200,
      markupBp: rules.defaultMarkupBp,
      vatRegimeCode: rules.defaultVatRegime,
      optional: comp.optional,
      costSource: "ai_estimate",
      estimateMinCents: est?.minCents ?? null,
      estimateMaxCents: est?.maxCents ?? null,
      notes: est?.basis ? `Stima: ${est.basis}` : null,
    });
  }

  const usedSections = [...new Set(lines.map((l) => l.sectionTitle))].sort((a, b) => (sectionOrder.get(a) ?? 999) - (sectionOrder.get(b) ?? 999));
  const sections: PlannedSection[] = usedSections.map((title, i) => ({ title, position: i + 1 }));
  return { sections, lines };
}
