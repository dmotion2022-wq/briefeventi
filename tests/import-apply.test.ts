import { beforeAll, describe, expect, it } from "vitest";
import { setupTempDataDir } from "./helpers/temp-db";

setupTempDataDir();

const WORKS = `ID / Nome PDF,Link al PDF,Tipo evento,N. persone (range),FIT col brief + motivo
Alfa.pdf,https://drive.google.com/file/d/1AlFaAlFaAlFaAlFa0123456789/view,convention,~300,4 – buono
`;
const LOCATION = `ID / Nome PDF,Link al PDF,Tipo asset,Città,Paese/Regione,Tipologia location,Capienza max (setup),Pernotto / Camere
Hotel Beta.pdf,https://drive.google.com/file/d/1BeTaBeTaBeTaBeTa0123456789/view,Hotel,Roma,IT — Lazio,Hotel / Resort,,Sì — 200 camere
`;
const BUDGETS = `ID / Nome file,Link al PDF,Fornitore,Categoria costo,Città / Area,Pricing model,Totale preventivo
Gamma.pdf,https://drive.google.com/file/d/1GaMmAgAmMaGaMmA0123456789/view,Gamma Service Srl,Service tecnico,Torino,Forfait / a preventivo,"6.512,81"
Delta.pdf,https://drive.google.com/file/d/1DeLtAdElTaDeLtA0123456789/view,GAMMA SERVICE S.R.L.,Service tecnico,Torino,Per ora,"150,00"
`;

let mod: typeof import("@/domain/import/drive");
let db: typeof import("@/db/client");

beforeAll(async () => {
  mod = await import("@/domain/import/drive");
  db = await import("@/db/client");
});

describe("applicazione dell'import", () => {
  it("prima importazione: tutto nuovo, fornitori deduplicati", () => {
    const plan = mod.buildPlan({ works: WORKS, location: LOCATION, budgets: BUDGETS });
    const diff = mod.applyPlan(plan);
    expect(diff.works.added).toEqual(["Alfa.pdf"]);
    expect(diff.venues.added).toEqual(["Hotel Beta"]);
    expect(diff.benchmarks.added).toHaveLength(2);

    const d = db.getDb();
    const suppliers = d.select().from(db.schema.suppliers).all();
    // "Gamma Service Srl" e "GAMMA SERVICE S.R.L." sono lo stesso fornitore; più l'hotel
    expect(suppliers.map((s) => s.name).sort()).toEqual(["Gamma Service Srl", "Hotel Beta"]);
    expect(suppliers.find((s) => s.name === "Hotel Beta")?.kind).toBe("hotel");
    const venue = d.select().from(db.schema.venues).get();
    expect(venue?.rooms).toBe(200);
    expect(venue?.supplierId).toBeTruthy();
  });

  it("seconda importazione identica: nessuna modifica", () => {
    const plan = mod.buildPlan({ works: WORKS, location: LOCATION, budgets: BUDGETS });
    const diff = mod.applyPlan(plan);
    expect(diff.works).toEqual({ added: [], changed: [], unchanged: 1 });
    expect(diff.venues).toEqual({ added: [], changed: [], unchanged: 1 });
    expect(diff.benchmarks).toEqual({ added: [], changed: [], unchanged: 2 });
    expect(db.getDb().select().from(db.schema.suppliers).all()).toHaveLength(2);
  });

  it("riga modificata nel foglio: risulta aggiornata", () => {
    const plan = mod.buildPlan({ works: WORKS.replace("~300", "~350"), location: LOCATION, budgets: BUDGETS });
    expect(mod.diffPlan(plan).works.changed).toEqual(["Alfa.pdf"]);
    mod.applyPlan(plan);
    const work = db.getDb().select().from(db.schema.referenceWorks).get();
    expect(work?.paxMax).toBe(350);
  });
});
