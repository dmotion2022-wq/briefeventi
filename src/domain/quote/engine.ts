// Motore del preventivo: funzioni pure, importi in centesimi interi, percentuali in punti base.
//
// Regole (da validare con il commercialista, i regimi sono configurabili):
// - costo effettivo: netto IVA per i regimi ordinari (IVA a credito detraibile); lordo per 74-ter,
//   art. 15, esente e fuori campo (IVA del fornitore non detraibile o costo ribaltato così com'è)
// - prezzo = forzato, oppure costo effettivo × (1 + ricarico); art. 15 senza ricarico
// - 74-ter: prezzo con IVA non esposta; IVA a debito sul margine = max(0, margine) × aliquota/(1+aliquota)
// - IVA ordinaria calcolata per aliquota sull'imponibile complessivo, arrotondata una volta per aliquota
// - fee d'agenzia: % sui prezzi delle voci incluse (escluse art. 15), voce a parte con il suo regime
// - imprevisti: % sui costi effettivi; "internal" riduce solo il margine previsto, "client_line" è una voce

export type VatKind = "standard" | "margin_74ter" | "art15" | "exempt" | "out_of_scope";

export type VatRegime = {
  code: string;
  label: string;
  kind: VatKind;
  rateBp: number;
  invoiceNote?: string | null;
  allowMarkup: boolean;
};

export type PricingModel = "unit" | "per_pax" | "forfait" | "package" | "percent";
export type CostSource = "benchmark" | "ai_estimate" | "supplier_quote" | "manual";

export type QuoteLineInput = {
  id: string;
  sectionId: string;
  description: string;
  quantity: number;
  periods: number;
  pricingModel: PricingModel;
  unitCostCents: number;
  fixedCostCents: number;
  includedQuantity?: number | null;
  extraUnitCostCents?: number | null;
  percentBp?: number | null;
  percentOfLineIds?: string[] | null;
  costIncludesVat: boolean;
  supplierVatRateBp: number;
  markupBp: number;
  priceOverrideCents?: number | null;
  vatRegimeCode: string;
  optional: boolean;
  costSource?: CostSource;
  estimateMinCents?: number | null;
  estimateMaxCents?: number | null;
};

export type QuoteSectionInput = { id: string; title: string; position: number; optional: boolean };

export type QuoteSettingsInput = {
  agencyFeeBp: number;
  agencyFeeVatRegime: string;
  contingencyBp: number;
  contingencyMode: "internal" | "client_line";
  rounding: "none" | "unit_1" | "unit_10";
  paymentTranches: { label: string; percentBp: number }[];
};

export type LineResult = {
  id: string;
  sectionId: string;
  included: boolean;
  regime: VatRegime;
  /** costo come inserito (netto o lordo secondo costIncludesVat) */
  costCents: number;
  netCostCents: number;
  grossCostCents: number;
  /** costo su cui si calcolano ricarico e margine */
  effectiveCostCents: number;
  priceCents: number;
  /** margine prima delle imposte sul margine (74-ter) */
  marginCents: number;
  vatOnMarginCents: number;
  warnings: string[];
};

export type VatSummaryRow = { code: string; label: string; rateBp: number; taxableCents: number; vatCents: number };

export type QuoteTotals = {
  lines: LineResult[];
  sections: { id: string; title: string; optional: boolean; priceCents: number; costCents: number }[];
  costCents: number;
  /** prezzi delle voci incluse (74-ter compreso di IVA non esposta) */
  linesPriceCents: number;
  agencyFeeCents: number;
  contingencyCents: number;
  contingencyMode: "internal" | "client_line";
  vatSummary: VatSummaryRow[];
  standardTaxableCents: number;
  standardVatCents: number;
  margin74ter: { priceCents: number; grossCostCents: number; marginCents: number; vatOnMarginCents: number };
  art15Cents: number;
  exemptCents: number;
  outOfScopeCents: number;
  /** totale che il cliente paga */
  clientTotalCents: number;
  /** ricavi al netto di IVA (anche quella sul margine 74-ter) */
  revenueNetCents: number;
  /** margine previsto dopo IVA sul margine e imprevisti interni */
  marginCents: number;
  marginBp: number | null;
  optionalPriceCents: number;
  aiEstimateShareBp: number;
  costRangeCents: { min: number; max: number };
  tranches: { label: string; percentBp: number; amountCents: number }[];
  warnings: string[];
};

const BP = 10_000;

export const roundHalfUp = (value: number) => Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
const pct = (amount: number, bp: number) => roundHalfUp((amount * bp) / BP);

function presentationRound(cents: number, mode: QuoteSettingsInput["rounding"]) {
  if (mode === "unit_1") return roundHalfUp(cents / 100) * 100;
  if (mode === "unit_10") return roundHalfUp(cents / 1000) * 1000;
  return cents;
}

/** Costo della voce come inserito, secondo il pricing model (le voci "percent" si calcolano dopo). */
export function baseCost(line: QuoteLineInput): { cost: number; warnings: string[] } {
  const warnings: string[] = [];
  const periods = line.periods > 0 ? line.periods : 1;
  switch (line.pricingModel) {
    case "unit":
    case "per_pax":
      return { cost: roundHalfUp(line.unitCostCents * line.quantity * periods), warnings };
    case "forfait":
      return { cost: roundHalfUp(line.fixedCostCents * periods), warnings };
    case "package": {
      const included = line.includedQuantity ?? 0;
      const extra = Math.max(0, line.quantity - included);
      if (extra > 0 && !line.extraUnitCostCents) {
        warnings.push(`Quantità oltre la soglia del pacchetto (${line.quantity} > ${included}) senza costo extra indicato`);
      }
      return { cost: roundHalfUp((line.fixedCostCents + extra * (line.extraUnitCostCents ?? 0)) * periods), warnings };
    }
    case "percent":
      return { cost: 0, warnings };
  }
}

export function computeQuote(input: {
  sections: QuoteSectionInput[];
  lines: QuoteLineInput[];
  regimes: VatRegime[];
  settings: QuoteSettingsInput;
}): QuoteTotals {
  const regimes = new Map(input.regimes.map((r) => [r.code, r]));
  const fallback = input.regimes.find((r) => r.kind === "standard") ?? {
    code: "IVA22",
    label: "IVA 22%",
    kind: "standard" as const,
    rateBp: 2200,
    allowMarkup: true,
  };
  const optionalSections = new Set(input.sections.filter((s) => s.optional).map((s) => s.id));
  const warnings: string[] = [];

  // 1. costo come inserito (prima le voci normali, poi quelle a percentuale)
  const rawCost = new Map<string, number>();
  const lineWarnings = new Map<string, string[]>();
  for (const line of input.lines) {
    const { cost, warnings: w } = baseCost(line);
    rawCost.set(line.id, cost);
    lineWarnings.set(line.id, w);
  }
  for (const line of input.lines.filter((l) => l.pricingModel === "percent")) {
    const refs = (line.percentOfLineIds ?? []).filter((id) => id !== line.id);
    const base = refs.reduce((sum, id) => {
      const ref = input.lines.find((l) => l.id === id);
      return ref && ref.pricingModel !== "percent" ? sum + (rawCost.get(id) ?? 0) : sum;
    }, 0);
    if (!refs.length) lineWarnings.get(line.id)!.push("Voce a percentuale senza voci di riferimento");
    rawCost.set(line.id, roundHalfUp(pct(base, line.percentBp ?? 0) * (line.periods > 0 ? line.periods : 1)));
  }

  // 2. costo netto/lordo/effettivo, prezzo e margine per voce
  const lines: LineResult[] = input.lines.map((line) => {
    const regime = regimes.get(line.vatRegimeCode) ?? fallback;
    const w = [...(lineWarnings.get(line.id) ?? [])];
    if (!regimes.has(line.vatRegimeCode)) w.push(`Regime IVA "${line.vatRegimeCode}" non trovato: uso ${fallback.code}`);
    const cost = rawCost.get(line.id) ?? 0;
    const r = line.supplierVatRateBp / BP;
    const netCost = line.costIncludesVat ? roundHalfUp(cost / (1 + r)) : cost;
    const grossCost = line.costIncludesVat ? cost : roundHalfUp(cost * (1 + r));
    const deductible = regime.kind === "standard";
    const effectiveCost = deductible ? netCost : grossCost;

    let price: number;
    if (line.priceOverrideCents != null) {
      price = line.priceOverrideCents;
    } else if (!regime.allowMarkup || regime.kind === "art15") {
      price = effectiveCost;
    } else {
      price = presentationRound(roundHalfUp(effectiveCost * (1 + line.markupBp / BP)), input.settings.rounding);
    }
    if (regime.kind === "art15" && price !== effectiveCost) {
      w.push("Spesa anticipata (art. 15): il prezzo dovrebbe coincidere con il costo");
    }

    const margin = price - effectiveCost;
    const vatOnMargin =
      regime.kind === "margin_74ter" ? roundHalfUp((Math.max(0, margin) * regime.rateBp) / (BP + regime.rateBp)) : 0;
    if (margin < 0) w.push("Prezzo sotto il costo");

    return {
      id: line.id,
      sectionId: line.sectionId,
      included: !line.optional && !optionalSections.has(line.sectionId),
      regime,
      costCents: cost,
      netCostCents: netCost,
      grossCostCents: grossCost,
      effectiveCostCents: effectiveCost,
      priceCents: price,
      marginCents: margin,
      vatOnMarginCents: vatOnMargin,
      warnings: w,
    };
  });

  const included = lines.filter((l) => l.included);
  const sum = (items: LineResult[], pick: (l: LineResult) => number) => items.reduce((s, l) => s + pick(l), 0);

  // 3. fee e imprevisti
  const feeBase = sum(
    included.filter((l) => l.regime.kind !== "art15"),
    (l) => l.priceCents,
  );
  const agencyFee = pct(feeBase, input.settings.agencyFeeBp);
  const feeRegime = regimes.get(input.settings.agencyFeeVatRegime) ?? fallback;
  const costTotal = sum(included, (l) => l.effectiveCostCents);
  const contingency = pct(costTotal, input.settings.contingencyBp);

  // 4. IVA ordinaria per aliquota (voci + fee + eventuale voce imprevisti)
  const taxable = new Map<string, { regime: VatRegime; cents: number }>();
  const addTaxable = (regime: VatRegime, cents: number) => {
    if (regime.kind !== "standard" || cents === 0) return;
    const row = taxable.get(regime.code) ?? { regime, cents: 0 };
    row.cents += cents;
    taxable.set(regime.code, row);
  };
  for (const l of included) addTaxable(l.regime, l.priceCents);
  addTaxable(feeRegime, agencyFee);
  if (input.settings.contingencyMode === "client_line") addTaxable(fallback, contingency);
  const vatSummary: VatSummaryRow[] = [...taxable.values()]
    .map(({ regime, cents }) => ({
      code: regime.code,
      label: regime.label,
      rateBp: regime.rateBp,
      taxableCents: cents,
      vatCents: pct(cents, regime.rateBp),
    }))
    .sort((a, b) => b.rateBp - a.rateBp);
  const standardTaxable = vatSummary.reduce((s, r) => s + r.taxableCents, 0);
  const standardVat = vatSummary.reduce((s, r) => s + r.vatCents, 0);

  // 5. regimi speciali
  const of = (kind: VatKind) => included.filter((l) => l.regime.kind === kind);
  const m74 = of("margin_74ter");
  const margin74ter = {
    priceCents: sum(m74, (l) => l.priceCents),
    grossCostCents: sum(m74, (l) => l.grossCostCents),
    marginCents: sum(m74, (l) => l.marginCents),
    vatOnMarginCents: sum(m74, (l) => l.vatOnMarginCents),
  };
  const art15 = sum(of("art15"), (l) => l.priceCents);
  const exempt = sum(of("exempt"), (l) => l.priceCents);
  const outOfScope = sum(of("out_of_scope"), (l) => l.priceCents);

  const clientTotal = standardTaxable + standardVat + margin74ter.priceCents + art15 + exempt + outOfScope;
  const linesPrice = sum(included, (l) => l.priceCents);
  const contingencyRevenue = input.settings.contingencyMode === "client_line" ? contingency : 0;
  const revenueNet = linesPrice - margin74ter.vatOnMarginCents + agencyFee + contingencyRevenue;
  const margin =
    sum(included, (l) => l.marginCents) -
    margin74ter.vatOnMarginCents +
    agencyFee +
    (input.settings.contingencyMode === "internal" ? -contingency : contingency);

  // 6. quota di costi ancora stimati dall'AI e forchetta
  const sourceOf = new Map(input.lines.map((l) => [l.id, l]));
  const aiCost = sum(
    included.filter((l) => sourceOf.get(l.id)?.costSource === "ai_estimate"),
    (l) => l.effectiveCostCents,
  );
  const costRange = included.reduce(
    (acc, l) => {
      const src = sourceOf.get(l.id)!;
      if (src.costSource === "ai_estimate" && src.estimateMinCents != null && src.estimateMaxCents != null) {
        const factor = l.costCents > 0 ? l.effectiveCostCents / l.costCents : 1;
        acc.min += roundHalfUp(src.estimateMinCents * factor);
        acc.max += roundHalfUp(src.estimateMaxCents * factor);
      } else {
        acc.min += l.effectiveCostCents;
        acc.max += l.effectiveCostCents;
      }
      return acc;
    },
    { min: 0, max: 0 },
  );

  // 7. tranche di pagamento: l'ultima è il resto, così la somma torna sempre
  const trancheBp = input.settings.paymentTranches.reduce((s, t) => s + t.percentBp, 0);
  if (input.settings.paymentTranches.length && trancheBp !== BP) {
    warnings.push(`Le tranche di pagamento sommano ${trancheBp / 100}% invece del 100%`);
  }
  let allocated = 0;
  const tranches = input.settings.paymentTranches.map((t, i, all) => {
    const amount = i === all.length - 1 ? clientTotal - allocated : pct(clientTotal, t.percentBp);
    allocated += amount;
    return { ...t, amountCents: amount };
  });

  const sections = [...input.sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const inSection = lines.filter((l) => l.sectionId === s.id && (s.optional || l.included));
      return {
        id: s.id,
        title: s.title,
        optional: s.optional,
        priceCents: sum(inSection, (l) => l.priceCents),
        costCents: sum(inSection, (l) => l.effectiveCostCents),
      };
    });

  return {
    lines,
    sections,
    costCents: costTotal,
    linesPriceCents: linesPrice,
    agencyFeeCents: agencyFee,
    contingencyCents: contingency,
    contingencyMode: input.settings.contingencyMode,
    vatSummary,
    standardTaxableCents: standardTaxable,
    standardVatCents: standardVat,
    margin74ter,
    art15Cents: art15,
    exemptCents: exempt,
    outOfScopeCents: outOfScope,
    clientTotalCents: clientTotal,
    revenueNetCents: revenueNet,
    marginCents: margin,
    marginBp: revenueNet > 0 ? Math.round((margin / revenueNet) * BP) : null,
    optionalPriceCents: sum(
      lines.filter((l) => !l.included),
      (l) => l.priceCents,
    ),
    aiEstimateShareBp: costTotal > 0 ? Math.round((aiCost / costTotal) * BP) : 0,
    costRangeCents: costRange,
    tranches,
    warnings: [...warnings, ...lines.flatMap((l) => l.warnings.map((w) => `${l.id}: ${w}`))],
  };
}
