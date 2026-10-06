import ExcelJS from "exceljs";
import { brand } from "@/brand/tokens";
import { computeForQuote } from "@/db/queries/quotes";
import { getDb, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/settings";

// Preventivo in Excel sul modello del file dell'agenzia: intestazione, sezioni numerate con
// subtotali, riepilogo IVA con formule vive (SOMMA.SE per codice IVA), tranche, note, opzioni.
// Ogni formula ha anche il risultato già calcolato, così l'anteprima mostra subito i numeri.

const EUR = '#,##0.00 "€"';
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex.replace("#", "")}` } });
const font = (opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: "Arial", size: 10, ...opts });
const euros = (cents: number) => Math.round(cents) / 100;

export async function buildQuoteXlsx(quoteId: string, variant: "client" | "internal") {
  const data = await computeForQuote(quoteId);
  if (!data) throw new Error("Preventivo non trovato");
  const { quote, sections, lines, totals, regimes } = data;
  const project = await getDb().select().from(schema.projects).where(eq(schema.projects.id, quote.projectId)).get();
  if (!project) throw new Error("Progetto non trovato");
  const agency = await getSetting("agency");
  const result = new Map(totals.lines.map((l) => [l.id, l]));
  const regimeByCode = new Map(regimes.map((r) => [r.code, r]));

  const wb = new ExcelJS.Workbook();
  wb.creator = agency.brand || agency.name;
  wb.created = new Date();

  // ── Foglio Preventivo ─────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Preventivo", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [
    { key: "n", width: 6 },
    { key: "voce", width: 46 },
    { key: "qta", width: 14 },
    { key: "iva", width: 12 },
    { key: "importo", width: 16 },
  ];

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = agency.name;
  ws.getCell("A1").font = font({ size: 16, bold: true, color: { argb: "FF191521" } });
  ws.mergeCells("A2:E2");
  ws.getCell("A2").value = [agency.brand, agency.address, agency.vatNumber ? `P.IVA ${agency.vatNumber}` : null].filter(Boolean).join(" · ");
  ws.getCell("A2").font = font({ size: 9, color: { argb: "FF6B6478" } });
  ws.getRow(3).height = 4;
  for (let c = 1; c <= 5; c++) ws.getRow(3).getCell(c).fill = fill(c <= 2 ? brand.violet : c <= 4 ? brand.magenta : brand.amber);

  const header: [string, string | number][] = [
    ["Cliente", project.clientName],
    ["Progetto", quote.title],
    ["Riferimento", quote.revision > 1 ? `${quote.number} rev. ${quote.revision}` : quote.number],
    ["Data", new Date(quote.date).toLocaleDateString("it-IT")],
    ["Validità", `${quote.validityDays} giorni`],
    ["Valuta", "EUR — importi IVA esclusa salvo dove indicato"],
  ];
  let row = 5;
  for (const [k, v] of header) {
    ws.getCell(`A${row}`).value = k;
    ws.getCell(`A${row}`).font = font({ bold: true, color: { argb: "FF6B6478" } });
    ws.mergeCells(`B${row}:E${row}`);
    ws.getCell(`B${row}`).value = v;
    ws.getCell(`B${row}`).font = font();
    row++;
  }
  row++;

  const headRow = ws.getRow(row);
  ["N.", "Voce", "Quantità", "IVA", "Importo"].forEach((h, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = h;
    cell.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    cell.fill = fill(brand.ink);
    cell.alignment = { horizontal: i >= 2 ? "right" : "left", vertical: "middle" };
  });
  headRow.height = 20;
  row++;

  const firstDataRow = row;
  const included = sections.filter((s) => !s.optional).sort((a, b) => a.position - b.position);
  const vatCodeCol = "F"; // colonna nascosta con il codice IVA per le SOMMA.SE

  included.forEach((section, si) => {
    const sLines = lines.filter((l) => l.sectionId === section.id && !l.optional).sort((a, b) => a.position - b.position);
    if (!sLines.length) return;
    const titleRow = ws.getRow(row);
    titleRow.getCell(1).value = si + 1;
    titleRow.getCell(2).value = section.title;
    titleRow.font = font({ bold: true });
    titleRow.eachCell((c) => (c.fill = fill("EDEAE3")));
    ws.getCell(`C${row}`).fill = fill("EDEAE3");
    ws.getCell(`D${row}`).fill = fill("EDEAE3");
    ws.getCell(`E${row}`).fill = fill("EDEAE3");
    row++;
    const start = row;
    sLines.forEach((l, li) => {
      const r = result.get(l.id)!;
      const reg = regimeByCode.get(l.vatRegimeCode);
      const lineRow = ws.getRow(row);
      lineRow.getCell(1).value = `${si + 1}.${li + 1}`;
      lineRow.getCell(2).value = l.detail ? `${l.description}\n${l.detail}` : l.description;
      lineRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
      const per = ({ none: "", hour: "ore", day: "giorni", night: "notti" } as const)[l.periodUnit];
      const times = l.periods !== 1 ? ` × ${l.periods}${per ? ` ${per}` : ""}` : "";
      lineRow.getCell(3).value = l.pricingModel === "forfait" || l.pricingModel === "percent" ? `a corpo${times}` : `${l.quantity} ${l.unit}${times}`;
      lineRow.getCell(3).alignment = { horizontal: "right", vertical: "top" };
      lineRow.getCell(4).value = reg?.kind === "standard" ? `${reg.rateBp / 100}%` : reg?.label ?? l.vatRegimeCode;
      lineRow.getCell(4).alignment = { horizontal: "right", vertical: "top" };
      lineRow.getCell(5).value = euros(r.priceCents);
      lineRow.getCell(5).numFmt = EUR;
      lineRow.getCell(5).alignment = { vertical: "top" };
      ws.getCell(`${vatCodeCol}${row}`).value = l.vatRegimeCode;
      lineRow.font = font();
      row++;
    });
    const subRow = ws.getRow(row);
    subRow.getCell(2).value = `Subtotale ${section.title}`;
    subRow.getCell(5).value = { formula: `SUM(E${start}:E${row - 1})`, result: euros(sLines.reduce((s, l) => s + result.get(l.id)!.priceCents, 0)) };
    subRow.getCell(5).numFmt = EUR;
    subRow.font = font({ bold: true });
    subRow.getCell(5).border = { top: { style: "thin", color: { argb: "FFC9C5D0" } } };
    row += 2;
  });

  // fee e imprevisti come righe proprie, con il loro codice IVA
  const extraLine = (label: string, cents: number, code: string) => {
    const r2 = ws.getRow(row);
    r2.getCell(2).value = label;
    r2.getCell(4).value = `${(regimeByCode.get(code)?.rateBp ?? 2200) / 100}%`;
    r2.getCell(4).alignment = { horizontal: "right" };
    r2.getCell(5).value = euros(cents);
    r2.getCell(5).numFmt = EUR;
    ws.getCell(`${vatCodeCol}${row}`).value = code;
    r2.font = font({ bold: true });
    row += 2;
  };
  if (totals.agencyFeeCents > 0) extraLine(`Fee d'agenzia (${quote.agencyFeeBp / 100}%)`, totals.agencyFeeCents, quote.agencyFeeVatRegime);
  if (totals.contingencyMode === "client_line" && totals.contingencyCents > 0)
    extraLine(`Imprevisti e variazioni (${quote.contingencyBp / 100}%)`, totals.contingencyCents, "IVA22");

  // riepilogo IVA: imponibile per aliquota con SOMMA.SE sui codici, IVA arrotondata per aliquota.
  // L'intervallo si ferma all'ultima riga di voci (niente riferimenti circolari).
  const lastItemRow = row - 1;
  const range = (col: string) => `${col}${firstDataRow}:${col}${lastItemRow}`;
  ws.getCell(`B${row}`).value = "Riepilogo";
  ws.getCell(`B${row}`).font = font({ bold: true, size: 11 });
  row++;
  const totalParts: string[] = [];
  const totalResults: number[] = [];
  for (const v of totals.vatSummary) {
    ws.getCell(`B${row}`).value = `Imponibile IVA ${v.rateBp / 100}%`;
    ws.getCell(`E${row}`).value = { formula: `SUMIF(${range(vatCodeCol)},"${v.code}",${range("E")})`, result: euros(v.taxableCents) };
    ws.getCell(`E${row}`).numFmt = EUR;
    totalParts.push(`E${row}`);
    totalResults.push(v.taxableCents);
    row++;
    ws.getCell(`B${row}`).value = `IVA ${v.rateBp / 100}%`;
    ws.getCell(`E${row}`).value = { formula: `ROUND(E${row - 1}*${v.rateBp / 10000},2)`, result: euros(v.vatCents) };
    ws.getCell(`E${row}`).numFmt = EUR;
    totalParts.push(`E${row}`);
    totalResults.push(v.vatCents);
    row++;
  }
  const special: [string, string, number][] = [
    ["74TER", "Servizi in regime speciale art. 74-ter (IVA non esposta)", totals.margin74ter.priceCents],
    ["ART15", "Spese anticipate in nome e per conto (art. 15)", totals.art15Cents],
    ["ESENTE", "Operazioni esenti", totals.exemptCents],
    ["FC", "Operazioni fuori campo IVA", totals.outOfScopeCents],
  ];
  for (const [code, label, cents] of special) {
    if (!cents) continue;
    ws.getCell(`B${row}`).value = label;
    ws.getCell(`E${row}`).value = { formula: `SUMIF(${range(vatCodeCol)},"${code}",${range("E")})`, result: euros(cents) };
    ws.getCell(`E${row}`).numFmt = EUR;
    totalParts.push(`E${row}`);
    totalResults.push(cents);
    row++;
  }
  const totalRowNumber = row;
  const totalRow = ws.getRow(row);
  totalRow.getCell(2).value = "TOTALE";
  totalRow.getCell(5).value = { formula: totalParts.join("+") || "0", result: euros(totals.clientTotalCents) };
  totalRow.getCell(5).numFmt = EUR;
  totalRow.font = font({ bold: true, size: 12, color: { argb: "FFFFFFFF" } });
  for (let c = 1; c <= 5; c++) totalRow.getCell(c).fill = fill(brand.violet);
  row += 2;

  if (totals.tranches.length) {
    ws.getCell(`B${row}`).value = "Modalità di pagamento";
    ws.getCell(`B${row}`).font = font({ bold: true });
    row++;
    let allocatedFormula: string[] = [];
    totals.tranches.forEach((t, i) => {
      ws.getCell(`B${row}`).value = t.label;
      ws.getCell(`D${row}`).value = t.percentBp / 10000;
      ws.getCell(`D${row}`).numFmt = "0%";
      const isLast = i === totals.tranches.length - 1;
      ws.getCell(`E${row}`).value = {
        formula: isLast ? `E${totalRowNumber}-${allocatedFormula.join("-") || 0}` : `ROUND(E${totalRowNumber}*D${row},2)`,
        result: euros(t.amountCents),
      };
      ws.getCell(`E${row}`).numFmt = EUR;
      allocatedFormula.push(`E${row}`);
      row++;
    });
    allocatedFormula = [];
    row++;
  }

  const notes = [...(quote.notes ?? [])];
  const regimeNotes = new Set(totals.lines.filter((l) => l.included && l.regime.invoiceNote).map((l) => l.regime.invoiceNote!));
  notes.push(...regimeNotes);
  if (notes.length) {
    ws.getCell(`B${row}`).value = "Note e condizioni";
    ws.getCell(`B${row}`).font = font({ bold: true });
    row++;
    for (const n of notes) {
      ws.mergeCells(`B${row}:E${row}`);
      ws.getCell(`B${row}`).value = `• ${n}`;
      ws.getCell(`B${row}`).font = font({ size: 9, color: { argb: "FF6B6478" } });
      ws.getCell(`B${row}`).alignment = { wrapText: true };
      row++;
    }
  }
  ws.getColumn(vatCodeCol).hidden = true;

  // ── Foglio Opzioni ────────────────────────────────────────────────────────
  const optional = lines.filter((l) => l.optional || sections.find((s) => s.id === l.sectionId)?.optional);
  if (optional.length) {
    const wo = wb.addWorksheet("Opzioni", { views: [{ showGridLines: false }] });
    wo.columns = [{ width: 50 }, { width: 14 }, { width: 16 }];
    wo.addRow(["Opzioni non incluse nel totale", "IVA", "Importo"]).font = font({ bold: true });
    for (const l of optional) {
      const reg = regimeByCode.get(l.vatRegimeCode);
      const r2 = wo.addRow([l.detail ? `${l.description} — ${l.detail}` : l.description, reg?.kind === "standard" ? `${reg.rateBp / 100}%` : reg?.label, euros(result.get(l.id)!.priceCents)]);
      r2.getCell(3).numFmt = EUR;
      r2.font = font();
    }
  }

  // ── Fogli interni: costi, ricarichi, margini, fornitori ───────────────────
  if (variant === "internal") {
    const wi = wb.addWorksheet("Interno", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
    wi.columns = [
      { header: "Sezione", width: 22 },
      { header: "Voce", width: 40 },
      { header: "Modello", width: 12 },
      { header: "Q.tà", width: 8 },
      { header: "Periodi", width: 8 },
      { header: "Costo unit./forfait", width: 16 },
      { header: "Costo totale", width: 14 },
      { header: "Costo effettivo", width: 14 },
      { header: "Ricarico %", width: 11 },
      { header: "Prezzo", width: 14 },
      { header: "Margine", width: 13 },
      { header: "Regime IVA", width: 12 },
      { header: "Origine costo", width: 14 },
      { header: "Opzionale", width: 10 },
    ];
    wi.getRow(1).font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    wi.getRow(1).eachCell((c) => (c.fill = fill(brand.ink)));
    for (const s of [...sections].sort((a, b) => a.position - b.position)) {
      for (const l of lines.filter((x) => x.sectionId === s.id).sort((a, b) => a.position - b.position)) {
        const r = result.get(l.id)!;
        const rowNum = wi.rowCount + 1;
        const unitOrFixed = l.pricingModel === "unit" || l.pricingModel === "per_pax" ? l.unitCostCents : l.fixedCostCents;
        const costFormula =
          l.pricingModel === "unit" || l.pricingModel === "per_pax"
            ? { formula: `ROUND(F${rowNum}*D${rowNum}*E${rowNum},2)`, result: euros(r.costCents) }
            : l.pricingModel === "forfait"
              ? { formula: `ROUND(F${rowNum}*E${rowNum},2)`, result: euros(r.costCents) }
              : euros(r.costCents);
        const added = wi.addRow([
          s.title,
          l.description,
          l.pricingModel,
          l.quantity,
          l.periods,
          euros(unitOrFixed),
          costFormula,
          euros(r.effectiveCostCents),
          l.markupBp / 10000,
          euros(r.priceCents),
          { formula: `J${rowNum}-H${rowNum}`, result: euros(r.marginCents) },
          l.vatRegimeCode,
          { manual: "manuale", benchmark: "listino", ai_estimate: "stima AI", supplier_quote: "fornitore" }[l.costSource],
          r.included ? "" : "sì",
        ]);
        added.font = font();
        for (const c of [6, 7, 8, 10, 11]) added.getCell(c).numFmt = EUR;
        added.getCell(9).numFmt = "0.0%";
      }
    }
    const sumRow = wi.rowCount + 2;
    wi.getCell(`B${sumRow}`).value = "Totali (voci incluse)";
    wi.getCell(`H${sumRow}`).value = { formula: `SUMIF(N2:N${sumRow - 2},"",H2:H${sumRow - 2})`, result: euros(totals.costCents) };
    wi.getCell(`J${sumRow}`).value = { formula: `SUMIF(N2:N${sumRow - 2},"",J2:J${sumRow - 2})`, result: euros(totals.linesPriceCents) };
    wi.getCell(`K${sumRow}`).value = { formula: `SUMIF(N2:N${sumRow - 2},"",K2:K${sumRow - 2})`, result: euros(totals.lines.filter((l) => l.included).reduce((s, l) => s + l.marginCents, 0)) };
    for (const c of ["H", "J", "K"]) wi.getCell(`${c}${sumRow}`).numFmt = EUR;
    wi.getRow(sumRow).font = font({ bold: true });
    const summary: [string, number][] = [
      ["Fee d'agenzia", totals.agencyFeeCents],
      ["IVA sul margine 74-ter (stima)", -totals.margin74ter.vatOnMarginCents],
      [totals.contingencyMode === "internal" ? "Imprevisti accantonati" : "Imprevisti fatturati", totals.contingencyMode === "internal" ? -totals.contingencyCents : totals.contingencyCents],
      ["Margine previsto", totals.marginCents],
    ];
    summary.forEach(([label, cents], i) => {
      const r2 = sumRow + 2 + i;
      wi.getCell(`B${r2}`).value = label;
      wi.getCell(`K${r2}`).value = euros(cents);
      wi.getCell(`K${r2}`).numFmt = EUR;
      wi.getRow(r2).font = font({ bold: label === "Margine previsto" });
    });

    const links = await getDb()
      .select({ link: schema.supplierLinks, supplier: schema.suppliers })
      .from(schema.supplierLinks)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierLinks.supplierId))
      .where(eq(schema.supplierLinks.projectId, project.id))
      .all();
    if (links.length) {
      const wf = wb.addWorksheet("Fornitori", { views: [{ showGridLines: false }] });
      wf.columns = [{ header: "Voce", width: 36 }, { header: "Fornitore", width: 30 }, { header: "Stato", width: 18 }, { header: "Prezzo quotato", width: 16 }, { header: "Note", width: 40 }];
      wf.getRow(1).font = font({ bold: true });
      const lineById = new Map(lines.map((l) => [l.id, l]));
      for (const { link, supplier } of links) {
        const r2 = wf.addRow([
          link.quoteLineId ? lineById.get(link.quoteLineId)?.description ?? "" : link.category ?? "",
          supplier.name,
          link.status,
          link.quotedCostCents != null ? euros(link.quotedCostCents) : "",
          link.notes ?? "",
        ]);
        r2.getCell(4).numFmt = EUR;
        r2.font = font();
      }
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const safe = `${quote.number}${quote.revision > 1 ? `-rev${quote.revision}` : ""}`;
  return { buffer, filename: `${safe} ${project.clientName} ${variant === "internal" ? "INTERNO" : "cliente"}.xlsx` };
}
