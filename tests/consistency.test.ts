import { describe, expect, it } from "vitest";
import { checkConsistency, type ConsistencyInput } from "@/domain/consistency/rules";

const base: ConsistencyInput = {
  projectId: "prj_1",
  sector: "corporate",
  startDate: "2027-01-28",
  endDate: "2027-01-29",
  paxTarget: 180,
  budgetCents: 12_000_000,
  slots: [
    { id: "s1", day: 1, date: "2027-01-28", kind: "plenary", title: "Apertura", startTime: "10:00" },
    { id: "s2", day: 1, date: "2027-01-28", kind: "lunch", title: "Pranzo", startTime: "13:00" },
    { id: "s3", day: 1, date: "2027-01-28", kind: "gala", title: "Cena di gala", startTime: "20:30" },
  ],
  components: [
    { id: "c1", category: "catering", title: "Pranzo a buffet", slotIds: ["s2"], quantityHint: 180, optional: false },
    { id: "c2", category: "catering", title: "Cena placée", slotIds: ["s3"], quantityHint: 180, optional: false },
  ],
  catering: {
    services: [
      { slotId: "s2", pax: 180, service: "Pranzo" },
      { slotId: "s3", pax: 180, service: "Cena" },
    ],
  },
  accommodation: { needed: true, nights: [{ date: "2027-01-28", singles: 120, doubles: 30 }] },
  venue: { requirements: { plenary: { pax: 200 } } },
  production: { siaeNeeded: false },
  textForMusicCheck: "Plenaria con talk show",
  quote: null,
  componentsEstimateCents: { min: 9_000_000, max: 11_000_000 },
};

const areas = (input: ConsistencyInput) => checkConsistency(input).map((i) => `${i.severity}:${i.area}`);

describe("controllo di coerenza", () => {
  it("una proposta coerente non ha problemi", () => {
    expect(checkConsistency(base)).toEqual([]);
  });

  it("pasto senza catering e senza voce di costo", () => {
    const input = { ...base, catering: { services: [base.catering!.services[0]] }, components: [base.components[0]] };
    const issues = checkConsistency(input);
    expect(issues.filter((i) => i.area === "catering").map((i) => i.severity)).toEqual(["error", "warning"]);
    expect(issues[0].message).toContain("Cena di gala");
  });

  it("componente collegato a uno slot cancellato", () => {
    const input = { ...base, components: [...base.components, { id: "c3", category: "av_regia", title: "Service audio", slotIds: ["s9"], quantityHint: 1, optional: false }] };
    expect(areas(input)).toContain("error:scaletta");
  });

  it("notti e camere che non tornano", () => {
    expect(areas({ ...base, accommodation: { needed: true, nights: [] } })).toContain("error:pernottamento");
    const fewBeds = { ...base, accommodation: { needed: true, nights: [{ date: "2027-01-28", singles: 50, doubles: 20 }] } };
    expect(areas(fewBeds)).toContain("warning:pernottamento");
  });

  it("plenaria sottodimensionata e pax incoerenti nel catering", () => {
    expect(areas({ ...base, venue: { requirements: { plenary: { pax: 150 } } } })).toContain("error:location");
    const services = [{ slotId: "s2", pax: 120, service: "Pranzo" }, base.catering!.services[1]];
    expect(areas({ ...base, catering: { services } })).toContain("warning:catering");
  });

  it("musica senza SIAE", () => {
    expect(areas({ ...base, textForMusicCheck: "Cena di gala con band live e DJ set" })).toContain("warning:permessi");
  });

  it("pharma: intrattenimento da verificare col compliance", () => {
    const input = {
      ...base,
      sector: "pharma",
      components: [...base.components, { id: "c9", category: "intrattenimento", title: "DJ set", slotIds: ["s3"], quantityHint: 1, optional: false }],
    };
    expect(areas(input)).toContain("warning:compliance");
  });

  it("budget: preventivo oltre il budget e stime", () => {
    expect(areas({ ...base, quote: { clientTotalCents: 13_200_000, aiEstimateShareBp: 0, lineComponentIds: ["c1", "c2"] } })).toContain("error:budget");
    // budget IVA esclusa: si confronta l'imponibile, non il totale con IVA
    const exVat = { ...base, quote: { clientTotalCents: 14_000_000, totalExVatCents: 11_500_000, aiEstimateShareBp: 0, lineComponentIds: ["c1", "c2"] } };
    expect(areas(exVat)).not.toContain("error:budget");
    expect(areas({ ...exVat, budgetIncludesVat: true })).toContain("error:budget");
    expect(areas({ ...base, componentsEstimateCents: { min: 10_000_000, max: 13_000_000 } })).toContain("warning:budget");
    const missing = checkConsistency({ ...base, quote: { clientTotalCents: 10_000_000, aiEstimateShareBp: 6000, lineComponentIds: ["c1"] } });
    expect(missing.map((i) => i.area)).toEqual(expect.arrayContaining(["preventivo"]));
    expect(missing.find((i) => i.message.includes("Cena placée"))).toBeTruthy();
  });

  it("errori prima degli avvisi", () => {
    const issues = checkConsistency({ ...base, accommodation: { needed: true, nights: [] }, textForMusicCheck: "dj" });
    expect(issues[0].severity).toBe("error");
  });
});
