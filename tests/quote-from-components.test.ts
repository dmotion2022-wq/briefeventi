import { describe, expect, it } from "vitest";
import { planQuoteFromComponents, type ChecklistDefaults, type ComponentForQuote } from "@/domain/quote/from-components";

const checklist: ChecklistDefaults[] = [
  { key: "location", defaultSection: "Location e sale", defaultVatRegime: "IVA22", defaultMarkupBp: 1500, position: 1 },
  { key: "pernottamento", defaultSection: "Ospitalità", defaultVatRegime: "IVA10", defaultMarkupBp: 1000, position: 3 },
  { key: "catering", defaultSection: "Food & beverage", defaultVatRegime: "IVA10", defaultMarkupBp: 1500, position: 4 },
];

const comp = (p: Partial<ComponentForQuote> & Pick<ComponentForQuote, "id" | "category" | "title">): ComponentForQuote => ({
  description: null,
  quantityHint: 1,
  unitHint: "n.",
  periodsHint: 1,
  pricingModelHint: "forfait",
  optional: false,
  specs: null,
  ...p,
});

describe("preventivo dai componenti", () => {
  const plan = planQuoteFromComponents(
    [
      comp({
        id: "c1",
        category: "catering",
        title: "Cena di gala",
        pricingModelHint: "per_pax",
        quantityHint: 180,
        unitHint: "pax",
        specs: { estimate: { unitCostCents: 6500, fixedCostCents: null, minCents: 1_000_000, maxCents: 1_400_000, basis: "listino catering" } },
      }),
      comp({
        id: "c2",
        category: "pernottamento",
        title: "Camere DUS",
        pricingModelHint: "unit",
        quantityHint: 150,
        unitHint: "camere",
        periodsHint: 1,
        specs: { periodUnit: "night", estimate: { unitCostCents: null, fixedCostCents: null, minCents: 1_800_000, maxCents: 2_400_000, basis: "4 stelle Nord Italia" } },
      }),
      comp({
        id: "c3",
        category: "location",
        title: "Affitto venue",
        specs: { estimate: { unitCostCents: null, fixedCostCents: 900_000, minCents: 700_000, maxCents: 1_100_000, basis: "archivio" } },
      }),
      comp({ id: "c4", category: "categoria_nuova", title: "Voce senza regole", optional: true }),
    ],
    checklist,
  );

  it("sezioni nell'ordine della checklist, più quella di riserva", () => {
    expect(plan.sections.map((s) => s.title)).toEqual(["Location e sale", "Ospitalità", "Food & beverage", "Altri servizi"]);
  });

  it("regime IVA e ricarico dalla categoria, costo come stima AI con forchetta", () => {
    const gala = plan.lines.find((l) => l.componentId === "c1")!;
    expect(gala).toMatchObject({ vatRegimeCode: "IVA10", supplierVatRateBp: 1000, markupBp: 1500, unitCostCents: 6500, quantity: 180, costSource: "ai_estimate" });
    expect(gala.estimateMinCents).toBe(1_000_000);
    expect(gala.notes).toBe("Stima: listino catering");
  });

  it("costo unitario ricavato dal centro della forchetta se manca", () => {
    const rooms = plan.lines.find((l) => l.componentId === "c2")!;
    // (18.000 + 24.000) / 2 = 21.000 € su 150 camere × 1 notte = 140 €
    expect(rooms.unitCostCents).toBe(14_000);
    expect(rooms.periodUnit).toBe("night");
  });

  it("forfait e voci opzionali", () => {
    expect(plan.lines.find((l) => l.componentId === "c3")!.fixedCostCents).toBe(900_000);
    const extra = plan.lines.find((l) => l.componentId === "c4")!;
    expect(extra.optional).toBe(true);
    expect(extra.vatRegimeCode).toBe("IVA22");
  });
});
