import { describe, expect, it } from "vitest";
import {
  displayNameFromFile,
  driveFileId,
  mapPricingModel,
  parseCsv,
  parseFit,
  parsePaxRange,
  parseRooms,
  toRecords,
} from "@/domain/import/normalize";
import { mapBenchmark, mapVenue, mapWork } from "@/domain/import/sheet";
import { parseItalianAmount } from "@/lib/money";

// Righe sintetiche con lo stesso formato del foglio "Executive Summary".
const WORKS_CSV = `ID / Nome PDF,Link al PDF,Tipo evento,N. persone (range),Durata,Area / Location proposta,Concept (headline),3 tag concept,Punti di engagement,Pernotto,Budget stimato,FIT col brief + motivo
Identificativo univoco e nome del documento,Percorso file o URL per aprire subito il PDF,Categoria evento,Range partecipanti,Formato temporale,Città/area,Una frase,3 parole chiave,In 1 riga,Sì/No,€/persona o totale,Valutazione 1–5
Esempio_Convention 2025.pdf,https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view,convention,~650,3 giorni / 2 notti,"Sardegna, resort",Convention in resort,resort; convention; experience,plenaria + breakout,Sì (nel resort),NC,"4 – format completo, logistica da validare"
,,,,,,,,,,,
Family Day Esempio.pdf,https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa987654/view,family day,660 per turno (2 turni),1 giorno,Torino,Viaggio nella scienza,scienza; generazioni; futuro,laboratori hands-on,No (day event),NC,5 – concept coerente
`;

const LOCATION_CSV = `ID / Nome PDF,Link al PDF,Tipo asset,Città,Paese/Regione,Tipologia location,Capienza max (setup),Spazi chiave / USP (1 riga),Vincoli operativi (1 riga),Pernotto / Camere,Budget level,Tag (3),Best for (use case),FIT (1–5) + motivo
ID / Nome PDF,Link al PDF,Tipo asset,Città,Paese/Regione,Tipologia location,Capienza max (setup),Spazi chiave / USP (1 riga),Vincoli operativi (1 riga),Pernotto / Camere,Budget level,Tag (3),Best for (use case),FIT (1–5) + motivo
___Museo Esempio Media Kit _ 2024.pdf,https://drive.google.com/file/d/1MuSeOeSeMpIo0123456789abcdefghij/view,Venue,Milano,IT — Lombardia,Museo,120 capienza,Venue culturale per eventi,Vincoli nel PDF,NA,Prezzi presenti,museo,corporate event,3 — scheda utile
Hotel Esempio MICE 2025.pdf,https://drive.google.com/file/d/1HoTeLeSeMpIo0123456789abcdefghij/view,Hotel,Roma,IT — Lazio,Hotel / Resort,Hotel / Resort: scheda location,,Vincoli nel PDF,Sì — 163 camere,Prezzi presenti,hotel,meeting / convention / hospitality,3 — scheda utile
DMC Esempio.pdf,https://drive.google.com/file/d/1DmCeSeMpIo0123456789abcdefghijkl/view,Destination-DMC,Porto,PT,Hotel / Resort,,DMC: servizi in destinazione,NA,NA,Prezzi presenti,dmc; hotel,destination & logistics,3 — utile per scouting
`;

const BUDGETS_CSV = `ID / Nome file,Link al PDF,Fornitore,Categoria costo,Città / Area,Tipo evento / Use case,PAX di riferimento,Periodo/Data,Pricing model,Unità di misura,Quantità inclusa / soglia,Costo unitario,Costo fisso / forfait,Totale preventivo,Incluso (in 1 riga),"Escluso / note / vincoli (1 riga)"
SPAZIO ESEMPIO 29 FEB.pdf,https://drive.google.com/file/d/1SpAzIoEsEmPiO0123456789abcdefghi/view,Spazio Esempio,Service tecnico,Roma,service AV / regia,80,11 Aprile 2024,Pacchetto (fino a pax),pax,fino a 80 pax,,,"€ 8.450,00",Spazio + proiezione immersiva + regia,Include supplementi preallestimento
CUFFIE ESEMPIO.pdf,https://drive.google.com/file/d/1CuFfIeEsEmPiO0123456789abcdefghi/view,Esempio Silent Srl,Audio silent,Milano,silent / audio tour,NC,NC,Per unità,cuffia/tx,,"12,50",,,Cuffie + trasmettitori,Verificare IVA inclusa/esclusa
TRANSFER ESEMPIO.pdf,https://drive.google.com/file/d/1TrAnSfErEsEmPiO0123456789abcdefg/view,Trasporti (fornitore nel PDF),Transfer,Venezia,trasferimenti + serata,330,NC,Pacchetto (fino a pax),pax,fino a 330 pax,,,"12.300,00",Bus GT + servizi serata,+ IVA
`;

describe("righe del foglio", () => {
  it("WORKS: salta riga descrittiva e righe vuote", () => {
    const records = toRecords(parseCsv(WORKS_CSV));
    expect(records).toHaveLength(2);
    const work = mapWork(records[0]);
    expect(work.name).toBe("Esempio_Convention 2025.pdf");
    expect(work.driveFileId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(work.paxMin).toBe(650);
    expect(work.tags).toEqual(["resort", "convention", "experience"]);
    expect(work.fitScore).toBe(4);
    expect(work.fitReason).toBe("format completo, logistica da validare");
    expect(work.budgetText).toBeNull();
    expect(mapWork(records[1]).paxMax).toBe(660);
  });

  it("LOCATION: salta l'intestazione duplicata e ricava paese, regione, camere", () => {
    const records = toRecords(parseCsv(LOCATION_CSV));
    expect(records).toHaveLength(3);
    const [museo, hotel, dmc] = records.map(mapVenue);
    expect(museo.name).toBe("Museo Esempio Media Kit 2024");
    expect(museo.capacityMax).toBe(120);
    expect(museo.country).toBe("IT");
    expect(museo.region).toBe("Lombardia");
    expect(museo.supplierKind).toBe("venue");
    expect(hotel.rooms).toBe(163);
    expect(hotel.capacityMax).toBeNull();
    expect(hotel.supplierKind).toBe("hotel");
    expect(dmc.country).toBe("PT");
    expect(dmc.supplierKind).toBe("dmc");
  });

  it("BUDGETS: importi italiani, pricing model, soglia, IVA", () => {
    const records = toRecords(parseCsv(BUDGETS_CSV));
    expect(records).toHaveLength(3);
    const [spazio, cuffie, transfer] = records.map(mapBenchmark);
    expect(spazio.totalCents).toBe(845000);
    expect(spazio.pricingModel).toBe("package");
    expect(spazio.includedQuantity).toBe(80);
    expect(spazio.supplierKind).toBe("av");
    expect(cuffie.unitCostCents).toBe(1250);
    expect(cuffie.pricingModel).toBe("unit");
    expect(cuffie.vatIncluded).toBe("unknown");
    expect(transfer.supplierName).toBeNull();
    expect(transfer.totalCents).toBe(1230000);
    expect(transfer.vatIncluded).toBe("no");
  });
});

describe("funzioni di pulizia", () => {
  it("importi", () => {
    expect(parseItalianAmount("€ 8.450,00")).toBe(845000);
    expect(parseItalianAmount("6.512,81")).toBe(651281);
    expect(parseItalianAmount("1.200")).toBe(120000);
    expect(parseItalianAmount("NC")).toBeNull();
  });
  it("pax", () => {
    expect(parsePaxRange("80–120")).toEqual({ min: 80, max: 120 });
    expect(parsePaxRange("fino a 80 pax")).toEqual({ min: null, max: 80 });
    expect(parsePaxRange("Milano ~300; altre tappe ~150 pax ciascuna")).toEqual({ min: 150, max: 300 });
  });
  it("fit, camere, link, nomi", () => {
    expect(parseFit("3 — utile per plenarie")).toEqual({ score: 3, reason: "utile per plenarie" });
    expect(parseRooms("Sì — 398 camere")).toEqual({ hasRooms: true, rooms: 398 });
    expect(parseRooms("Sì")).toEqual({ hasRooms: true, rooms: null });
    expect(driveFileId(" https://drive.google.com/file/d/1aVcBstS0PtAC9kxt3xBW66O3j8-xyz/view")).toBe(
      "1aVcBstS0PtAC9kxt3xBW66O3j8-xyz",
    );
    expect(displayNameFromFile("GARAGE21 - PACCHETTO SERVIZI 2023 v2.pdf")).toBe("GARAGE21 – PACCHETTO SERVIZI 2023 v2");
  });
  it("pricing model", () => {
    expect(mapPricingModel("Per ora")).toEqual({ model: "unit", periodUnit: "hour" });
    expect(mapPricingModel("Forfait / a preventivo").model).toBe("forfait");
  });
});

describe("OCR delle brochure", () => {
  it("legge solo le prime e le ultime pagine senza testo", async () => {
    const { pagesToOcr } = await import("@/worker/jobs/ocr");
    expect(pagesToOcr([1, 2, 3, 10, 30, 58, 59, 60, 61, 62, 63], 63)).toEqual([1, 2, 58, 59, 60, 61, 62, 63]);
    expect(pagesToOcr([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });
});
