import { describe, expect, it } from "vitest";
import { baseCost, computeQuote, type QuoteLineInput, type VatRegime } from "@/domain/quote/engine";

const REGIMES: VatRegime[] = [
  { code: "IVA22", label: "IVA 22%", kind: "standard", rateBp: 2200, allowMarkup: true },
  { code: "IVA10", label: "IVA 10%", kind: "standard", rateBp: 1000, allowMarkup: true },
  { code: "74TER", label: "74-ter", kind: "margin_74ter", rateBp: 2200, allowMarkup: true },
  { code: "ART15", label: "Art. 15", kind: "art15", rateBp: 0, allowMarkup: false },
  { code: "ESENTE", label: "Esente", kind: "exempt", rateBp: 0, allowMarkup: true },
];

const line = (p: Partial<QuoteLineInput> & Pick<QuoteLineInput, "id" | "sectionId">): QuoteLineInput => ({
  description: p.id,
  quantity: 1,
  periods: 1,
  pricingModel: "forfait",
  unitCostCents: 0,
  fixedCostCents: 0,
  costIncludesVat: false,
  supplierVatRateBp: 2200,
  markupBp: 0,
  vatRegimeCode: "IVA22",
  optional: false,
  costSource: "manual",
  ...p,
});

const SECTIONS = [
  { id: "S1", title: "Location e sale", position: 1, optional: false },
  { id: "S2", title: "Ospitalità", position: 2, optional: false },
  { id: "S3", title: "Opzioni", position: 3, optional: true },
];

// Caso "dorato": i valori attesi sono calcolati a mano (vedi commenti).
const LINES: QuoteLineInput[] = [
  // affitto sala: 4.000 € netti, ricarico 15% → 4.600 €
  line({ id: "L1", sectionId: "S1", fixedCostCents: 400_000, markupBp: 1500 }),
  // coffee break: 8,50 € × 120 pax × 2 giorni = 2.040 €, IVA 10%, ricarico 20% → 2.448 € (stima AI 1.800–2.300)
  line({
    id: "L2",
    sectionId: "S2",
    pricingModel: "per_pax",
    unitCostCents: 850,
    quantity: 120,
    periods: 2,
    supplierVatRateBp: 1000,
    vatRegimeCode: "IVA10",
    markupBp: 2000,
    costSource: "ai_estimate",
    estimateMinCents: 180_000,
    estimateMaxCents: 230_000,
  }),
  // hotel in 74-ter: 150 € IVA inclusa × 60 camere × 2 notti = 18.000 € lordi, ricarico 12% → 20.160 €
  // margine 2.160 €, IVA sul margine 2.160 × 22/122 = 389,51 €
  line({
    id: "L3",
    sectionId: "S2",
    pricingModel: "unit",
    unitCostCents: 15_000,
    quantity: 60,
    periods: 2,
    costIncludesVat: true,
    supplierVatRateBp: 1000,
    markupBp: 1200,
    vatRegimeCode: "74TER",
  }),
  // spesa anticipata art. 15: 500 € ribaltati senza ricarico
  line({ id: "L4", sectionId: "S1", fixedCostCents: 50_000, costIncludesVat: true, markupBp: 1500, vatRegimeCode: "ART15" }),
  // voce opzionale: esclusa dai totali
  line({ id: "L5", sectionId: "S1", fixedCostCents: 100_000, markupBp: 2000, optional: true }),
  // voce in sezione opzionale: esclusa dai totali
  line({ id: "L6", sectionId: "S3", fixedCostCents: 60_000, markupBp: 2500 }),
  // pacchetto silent: 2.000 € fino a 100 pax + 20 extra × 15 € = 2.300 €, ricarico 10% → 2.530 €
  line({
    id: "L7",
    sectionId: "S1",
    pricingModel: "package",
    fixedCostCents: 200_000,
    includedQuantity: 100,
    quantity: 120,
    extraUnitCostCents: 1_500,
    markupBp: 1000,
  }),
  // assicurazione: 10% di (L1 + L7) = 630 €
  line({ id: "L8", sectionId: "S1", pricingModel: "percent", percentBp: 1000, percentOfLineIds: ["L1", "L7"] }),
];

const SETTINGS = {
  agencyFeeBp: 1000,
  agencyFeeVatRegime: "IVA22",
  contingencyBp: 500,
  contingencyMode: "internal" as const,
  rounding: "none" as const,
  paymentTranches: [
    { label: "Acconto", percentBp: 5000 },
    { label: "Saldo", percentBp: 5000 },
  ],
};

describe("motore del preventivo: caso misto calcolato a mano", () => {
  const q = computeQuote({ sections: SECTIONS, lines: LINES, regimes: REGIMES, settings: SETTINGS });
  const byId = Object.fromEntries(q.lines.map((l) => [l.id, l]));

  it("prezzi e costi per voce", () => {
    expect(byId.L1.priceCents).toBe(460_000);
    expect(byId.L2.priceCents).toBe(244_800);
    expect(byId.L3.effectiveCostCents).toBe(1_800_000);
    expect(byId.L3.netCostCents).toBe(1_636_364);
    expect(byId.L3.priceCents).toBe(2_016_000);
    expect(byId.L3.vatOnMarginCents).toBe(38_951);
    expect(byId.L4.priceCents).toBe(50_000);
    expect(byId.L7.costCents).toBe(230_000);
    expect(byId.L7.priceCents).toBe(253_000);
    expect(byId.L8.costCents).toBe(63_000);
    expect(byId.L5.included).toBe(false);
    expect(byId.L6.included).toBe(false);
  });

  it("fee, imprevisti e riepilogo IVA per aliquota", () => {
    // base fee: 4.600 + 2.448 + 20.160 + 2.530 + 630 = 30.368 € → 10% = 3.036,80 €
    expect(q.agencyFeeCents).toBe(303_680);
    // imprevisti 5% dei costi effettivi 27.470 € = 1.373,50 €
    expect(q.costCents).toBe(2_747_000);
    expect(q.contingencyCents).toBe(137_350);
    expect(q.vatSummary).toEqual([
      { code: "IVA22", label: "IVA 22%", rateBp: 2200, taxableCents: 1_079_680, vatCents: 237_530 },
      { code: "IVA10", label: "IVA 10%", rateBp: 1000, taxableCents: 244_800, vatCents: 24_480 },
    ]);
  });

  it("totali cliente e margine interno", () => {
    expect(q.margin74ter).toEqual({ priceCents: 2_016_000, grossCostCents: 1_800_000, marginCents: 216_000, vatOnMarginCents: 38_951 });
    expect(q.art15Cents).toBe(50_000);
    // 13.244,80 imponibile + 2.620,10 IVA + 20.160 (74-ter) + 500 (art. 15) = 36.524,90 €
    expect(q.clientTotalCents).toBe(3_652_490);
    // margine: 3.398 (voci) − 389,51 (IVA margine) + 3.036,80 (fee) − 1.373,50 (imprevisti) = 4.671,79 €
    expect(q.marginCents).toBe(467_179);
    expect(q.revenueNetCents).toBe(3_351_529);
    expect(q.marginBp).toBe(1394);
    expect(q.optionalPriceCents).toBe(195_000);
  });

  it("sezioni, quota stimata dall'AI, tranche", () => {
    expect(q.sections.map((s) => s.priceCents)).toEqual([826_000, 2_260_800, 75_000]);
    expect(q.aiEstimateShareBp).toBe(743);
    expect(q.costRangeCents).toEqual({ min: 2_723_000, max: 2_773_000 });
    expect(q.tranches.map((t) => t.amountCents)).toEqual([1_826_245, 1_826_245]);
    expect(q.tranches.reduce((s, t) => s + t.amountCents, 0)).toBe(q.clientTotalCents);
  });
});

describe("casi limite", () => {
  it("pacchetto oltre soglia senza costo extra: avviso", () => {
    const r = baseCost(line({ id: "P", sectionId: "S1", pricingModel: "package", fixedCostCents: 1000, includedQuantity: 10, quantity: 12 }));
    expect(r.cost).toBe(1000);
    expect(r.warnings[0]).toMatch(/oltre la soglia/);
  });

  it("74-ter in perdita: nessuna IVA sul margine", () => {
    const q = computeQuote({
      sections: SECTIONS,
      lines: [line({ id: "H", sectionId: "S2", fixedCostCents: 10_000, costIncludesVat: true, vatRegimeCode: "74TER", priceOverrideCents: 9_000 })],
      regimes: REGIMES,
      settings: { ...SETTINGS, agencyFeeBp: 0, contingencyBp: 0 },
    });
    expect(q.lines[0].vatOnMarginCents).toBe(0);
    expect(q.lines[0].warnings).toContain("Prezzo sotto il costo");
  });

  it("art. 15 con prezzo forzato diverso dal costo: avviso", () => {
    const q = computeQuote({
      sections: SECTIONS,
      lines: [line({ id: "A", sectionId: "S1", fixedCostCents: 10_000, vatRegimeCode: "ART15", priceOverrideCents: 12_000 })],
      regimes: REGIMES,
      settings: SETTINGS,
    });
    expect(q.lines[0].warnings[0]).toMatch(/art\. 15/);
  });

  it("tranche che non sommano al 100%: avviso, ma totale sempre coperto", () => {
    const q = computeQuote({
      sections: SECTIONS,
      lines: [line({ id: "X", sectionId: "S1", fixedCostCents: 99_999 })],
      regimes: REGIMES,
      settings: { ...SETTINGS, agencyFeeBp: 0, paymentTranches: [{ label: "A", percentBp: 3000 }, { label: "B", percentBp: 3000 }] },
    });
    expect(q.warnings[0]).toMatch(/60%/);
    expect(q.tranches.reduce((s, t) => s + t.amountCents, 0)).toBe(q.clientTotalCents);
  });

  it("arrotondamento di presentazione a 10 €", () => {
    const q = computeQuote({
      sections: SECTIONS,
      lines: [line({ id: "R", sectionId: "S1", fixedCostCents: 123_456, markupBp: 1000 })],
      regimes: REGIMES,
      settings: { ...SETTINGS, rounding: "unit_10" },
    });
    // 1.234,56 × 1,10 = 1.358,016 → 1.360 €
    expect(q.lines[0].priceCents).toBe(136_000);
  });

  it("imprevisti visibili al cliente: voce al 22% e margine", () => {
    const q = computeQuote({
      sections: SECTIONS,
      lines: [line({ id: "C", sectionId: "S1", fixedCostCents: 100_000, markupBp: 1000 })],
      regimes: REGIMES,
      settings: { ...SETTINGS, agencyFeeBp: 0, contingencyMode: "client_line" },
    });
    // imponibile 1.100 + 50 (imprevisti) = 1.150 €, IVA 253 €
    expect(q.standardTaxableCents).toBe(115_000);
    expect(q.standardVatCents).toBe(25_300);
    expect(q.marginCents).toBe(15_000);
  });
});
