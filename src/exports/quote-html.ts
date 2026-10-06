import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { computeForQuote } from "@/db/queries/quotes";
import { getSetting } from "@/lib/settings";

// Preventivo cliente impaginato per la stampa (A4): stessi numeri dell'app e dell'Excel.

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const eur = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);

export function buildQuoteHtml(quoteId: string) {
  const data = computeForQuote(quoteId);
  if (!data) throw new Error("Preventivo non trovato");
  const { quote, sections, lines, totals } = data;
  const project = getDb().select().from(schema.projects).where(eq(schema.projects.id, quote.projectId)).get()!;
  const agency = getSetting("agency");
  const result = new Map(totals.lines.map((l) => [l.id, l]));
  const sorted = [...sections].sort((a, b) => a.position - b.position);

  const body = sorted
    .filter((s) => !s.optional)
    .map((s, si) => {
      const sLines = lines.filter((l) => l.sectionId === s.id && result.get(l.id)?.included).sort((a, b) => a.position - b.position);
      if (!sLines.length) return "";
      const rows = sLines
        .map((l, li) => {
          const r = result.get(l.id)!;
          const per = ({ none: "", hour: "ore", day: "giorni", night: "notti" } as const)[l.periodUnit];
          const times = l.periods !== 1 ? ` × ${l.periods}${per ? ` ${per}` : ""}` : "";
          const qty = l.pricingModel === "forfait" || l.pricingModel === "percent" ? `a corpo${times}` : `${l.quantity} ${esc(l.unit)}${times}`;
          const vat = r.regime.kind === "standard" ? `${r.regime.rateBp / 100}%` : esc(r.regime.label);
          return `<tr><td class="n">${si + 1}.${li + 1}</td><td><strong>${esc(l.description)}</strong>${l.detail ? `<div class="d">${esc(l.detail)}</div>` : ""}</td><td class="r">${qty}</td><td class="r">${vat}</td><td class="r m">${eur(r.priceCents)}</td></tr>`;
        })
        .join("");
      const sub = totals.sections.find((x) => x.id === s.id)?.priceCents ?? 0;
      return `<tbody><tr class="sec"><td class="n">${si + 1}</td><td colspan="4">${esc(s.title)}</td></tr>${rows}<tr class="sub"><td></td><td colspan="3">Subtotale ${esc(s.title)}</td><td class="r m">${eur(sub)}</td></tr></tbody>`;
    })
    .join("");

  const summary = [
    ...(totals.agencyFeeCents ? [[`Fee d'agenzia (${quote.agencyFeeBp / 100}%)`, totals.agencyFeeCents]] : []),
    ...(totals.contingencyMode === "client_line" && totals.contingencyCents ? [[`Imprevisti (${quote.contingencyBp / 100}%)`, totals.contingencyCents]] : []),
    ...totals.vatSummary.flatMap((v) => [
      [`Imponibile IVA ${v.rateBp / 100}%`, v.taxableCents],
      [`IVA ${v.rateBp / 100}%`, v.vatCents],
    ]),
    ...(totals.margin74ter.priceCents ? [["Servizi in regime art. 74-ter (IVA non esposta)", totals.margin74ter.priceCents]] : []),
    ...(totals.art15Cents ? [["Spese anticipate art. 15", totals.art15Cents]] : []),
    ...(totals.exemptCents ? [["Operazioni esenti", totals.exemptCents]] : []),
    ...(totals.outOfScopeCents ? [["Fuori campo IVA", totals.outOfScopeCents]] : []),
  ] as [string, number][];

  const optional = lines.filter((l) => !result.get(l.id)?.included);
  const notes = [...(quote.notes ?? []), ...new Set(totals.lines.filter((l) => l.included && l.regime.invoiceNote).map((l) => l.regime.invoiceNote!))];

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(quote.number)}</title><style>
  body{font-family:Arial,Helvetica,sans-serif;color:#191521;font-size:10.5px;margin:0}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6C4DF6;padding-bottom:10px;margin-bottom:14px}
  .head h1{font-size:18px;margin:0}.muted{color:#6B6478}.meta td{padding:2px 12px 2px 0}
  table.q{width:100%;border-collapse:collapse;margin-top:12px}table.q td{padding:6px 6px;border-bottom:1px solid #E3E0D9;vertical-align:top}
  .n{width:34px;color:#6B6478}.r{text-align:right;white-space:nowrap}.m{font-variant-numeric:tabular-nums}.d{color:#6B6478;margin-top:2px}
  tr.sec td{background:#EDEAE3;font-weight:bold}tr.sub td{font-weight:bold;border-bottom:2px solid #C9C5D0}
  tbody{break-inside:avoid}table.s{margin-left:auto;margin-top:14px;border-collapse:collapse;min-width:300px}table.s td{padding:4px 6px}
  .tot td{background:#6C4DF6;color:#fff;font-weight:bold;font-size:12px}h2{font-size:12px;margin:18px 0 6px}
  .notes li{margin-bottom:3px;color:#2E2740}
  </style></head><body>
  <div class="head"><div><h1>${esc(agency.name)}</h1><div class="muted">${esc([agency.brand, agency.address, agency.vatNumber ? `P.IVA ${agency.vatNumber}` : ""].filter(Boolean).join(" · "))}</div></div>
  <div style="text-align:right"><div style="font-size:16px;font-weight:bold">Preventivo</div><div class="muted">${esc(quote.number)}${quote.revision > 1 ? ` rev. ${quote.revision}` : ""}</div></div></div>
  <table class="meta"><tr><td class="muted">Cliente</td><td><strong>${esc(project.clientName)}</strong></td></tr>
  <tr><td class="muted">Progetto</td><td>${esc(quote.title)}</td></tr>
  <tr><td class="muted">Data</td><td>${new Date(quote.date).toLocaleDateString("it-IT")} · validità ${quote.validityDays} giorni</td></tr>
  <tr><td class="muted">Valuta</td><td>EUR, importi IVA esclusa salvo dove indicato</td></tr></table>
  <table class="q"><tbody><tr class="muted"><td class="n">N.</td><td>Voce</td><td class="r">Quantità</td><td class="r">IVA</td><td class="r">Importo</td></tr></tbody>${body}</table>
  <table class="s">${summary.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r m">${eur(v)}</td></tr>`).join("")}<tr class="tot"><td>TOTALE</td><td class="r m">${eur(totals.clientTotalCents)}</td></tr></table>
  ${totals.tranches.length ? `<h2>Modalità di pagamento</h2><table class="s" style="margin-left:0">${totals.tranches.map((t) => `<tr><td>${esc(t.label)} (${t.percentBp / 100}%)</td><td class="r m">${eur(t.amountCents)}</td></tr>`).join("")}</table>` : ""}
  ${optional.length ? `<h2>Opzioni non incluse nel totale</h2><table class="q">${optional.map((l) => `<tr><td>${esc(l.description)}</td><td class="r m">${eur(result.get(l.id)!.priceCents)}</td></tr>`).join("")}</table>` : ""}
  ${notes.length ? `<h2>Note e condizioni</h2><ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
  </body></html>`;
}
