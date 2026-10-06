"use client";

import { Fragment, useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Trash, TriangleAlert } from "lucide-react";
import type { schema } from "@/db/client";
import { computeQuote, type QuoteTotals, type VatRegime } from "@/domain/quote/engine";
import {
  addLineAction,
  deleteLineAction,
  deleteSectionAction,
  duplicateLineAction,
  moveSectionAction,
  saveLineAction,
  updateSectionAction,
} from "@/server/quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBp, formatCents } from "@/lib/money";
import { MiniSelect, MoneyInput, NumberInput, TextInput } from "./inputs";
import { TotalsPanel } from "./totals-panel";

type Quote = typeof schema.quotes.$inferSelect;
type Section = typeof schema.quoteSections.$inferSelect;
type Line = typeof schema.quoteLines.$inferSelect;

const MODEL_LABELS = { unit: "a unità", per_pax: "a persona", forfait: "forfait", package: "pacchetto", percent: "% di voci" } as const;
const PERIOD_LABELS = { none: "—", hour: "ore", day: "giorni", night: "notti" } as const;
const SOURCE: Record<Line["costSource"], { label: string; tone: "neutral" | "violet" | "amber" | "ok" }> = {
  manual: { label: "manuale", tone: "neutral" },
  benchmark: { label: "listino", tone: "violet" },
  ai_estimate: { label: "stima AI", tone: "amber" },
  supplier_quote: { label: "fornitore", tone: "ok" },
};

const EDITABLE: (keyof Line)[] = [
  "description",
  "detail",
  "quantity",
  "unit",
  "periods",
  "periodUnit",
  "pricingModel",
  "unitCostCents",
  "fixedCostCents",
  "includedQuantity",
  "extraUnitCostCents",
  "percentBp",
  "percentOfLineIds",
  "costIncludesVat",
  "supplierVatRateBp",
  "markupBp",
  "priceOverrideCents",
  "vatRegimeCode",
  "optional",
  "costSource",
  "notes",
];

export function QuoteEditor({
  quote,
  sections,
  initialLines,
  regimes,
  view,
  readOnly,
}: {
  quote: Quote;
  sections: Section[];
  initialLines: Line[];
  regimes: VatRegime[];
  view: "internal" | "client";
  readOnly: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // le righe arrivano dal server dopo aggiunte/eliminazioni: si riallinea lo stato locale
  const serverKey = initialLines.map((l) => l.id).join("|");
  const [lastKey, setLastKey] = useState(serverKey);
  if (serverKey !== lastKey) {
    setLastKey(serverKey);
    setLines(initialLines);
  }

  const totals: QuoteTotals = useMemo(
    () =>
      computeQuote({
        sections: sections.map((s) => ({ id: s.id, title: s.title, position: s.position, optional: s.optional })),
        lines: lines.map((l) => ({ ...l, costSource: l.costSource })),
        regimes,
        settings: {
          agencyFeeBp: quote.agencyFeeBp,
          agencyFeeVatRegime: quote.agencyFeeVatRegime,
          contingencyBp: quote.contingencyBp,
          contingencyMode: quote.contingencyMode,
          rounding: quote.rounding,
          paymentTranches: quote.paymentTranches ?? [],
        },
      }),
    [lines, sections, regimes, quote],
  );
  const result = useMemo(() => new Map(totals.lines.map((l) => [l.id, l])), [totals]);

  const update = useCallback((id: string, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // un costo modificato a mano non è più una stima
        if (("unitCostCents" in patch || "fixedCostCents" in patch) && !("costSource" in patch)) next.costSource = "manual";
        const pending = timers.current.get(id);
        if (pending) clearTimeout(pending);
        timers.current.set(
          id,
          setTimeout(() => {
            setSaving("saving");
            const body = Object.fromEntries(EDITABLE.map((k) => [k, next[k]]));
            saveLineAction(id, body)
              .then(() => setSaving("saved"))
              .catch(() => setSaving("error"));
          }, 350),
        );
        return next;
      }),
    );
  }, []);

  const refreshAfter = (p: Promise<unknown>) => startTransition(async () => {
    await p;
    router.refresh();
  });

  const regimeOf = (code: string) => regimes.find((r) => r.code === code);
  const sorted = [...sections].sort((a, b) => a.position - b.position);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex h-5 items-center justify-end text-[12px] text-n500">
        {saving === "saving" && "Salvataggio…"}
        {saving === "saved" && "Tutte le modifiche salvate"}
        {saving === "error" && <span className="text-warn">Errore di salvataggio: ricarica la pagina</span>}
      </div>
      {sorted.map((section, si) => {
        const sectionLines = lines.filter((l) => l.sectionId === section.id).sort((a, b) => a.position - b.position);
        const sub = totals.sections.find((s) => s.id === section.id);
        if (view === "client" && sectionLines.length === 0) return null;
        return (
          <section key={section.id} className="rounded-lg border border-line bg-card shadow-sm">
            <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="font-mono text-[11px] text-n400">{si + 1}</span>
              {readOnly || view === "client" ? (
                <span className="font-semibold">{section.title}</span>
              ) : (
                <TextInput
                  value={section.title}
                  onCommit={(title) => refreshAfter(updateSectionAction(section.id, { title }))}
                  className="max-w-xs font-semibold"
                />
              )}
              {section.optional && <Badge tone="amber">opzionale, fuori totale</Badge>}
              <span className="ml-auto tabular text-[13px] font-medium">{formatCents(sub?.priceCents ?? 0)}</span>
              {!readOnly && view === "internal" && (
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="sm" title="Sposta su" onClick={() => refreshAfter(moveSectionAction(section.id, -1))}>
                    <ArrowUp size={13} />
                  </Button>
                  <Button variant="ghost" size="sm" title="Sposta giù" onClick={() => refreshAfter(moveSectionAction(section.id, 1))}>
                    <ArrowDown size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={section.optional ? "Includi nel totale" : "Rendi opzionale"}
                    onClick={() => refreshAfter(updateSectionAction(section.id, { optional: !section.optional }))}
                  >
                    {section.optional ? "Includi" : "Opzionale"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Elimina la sezione"
                    onClick={() => {
                      if (sectionLines.length && !confirm(`Eliminare la sezione e le sue ${sectionLines.length} voci?`)) return;
                      refreshAfter(deleteSectionAction(section.id));
                    }}
                  >
                    <Trash size={13} />
                  </Button>
                </div>
              )}
            </header>

            {sectionLines.length > 0 && (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="eyebrow border-b border-line text-left">
                    <th className="w-6 py-1.5 pl-3 font-normal" />
                    <th className="py-1.5 font-normal">Voce</th>
                    {view === "internal" ? (
                      <>
                        <th className="w-28 py-1.5 font-normal">Modello</th>
                        <th className="w-20 py-1.5 text-right font-normal">Q.tà</th>
                        <th className="w-32 py-1.5 font-normal">× Periodi</th>
                        <th className="w-28 py-1.5 text-right font-normal">Costo</th>
                        <th className="w-20 py-1.5 text-right font-normal">Ric. %</th>
                        <th className="w-28 py-1.5 font-normal">IVA</th>
                        <th className="w-28 py-1.5 text-right font-normal">Prezzo</th>
                        <th className="w-24 py-1.5 pr-2 text-right font-normal">Margine</th>
                        <th className="w-16 py-1.5 pr-3 font-normal" />
                      </>
                    ) : (
                      <>
                        <th className="w-24 py-1.5 text-right font-normal">Quantità</th>
                        <th className="w-28 py-1.5 font-normal">IVA</th>
                        <th className="w-32 py-1.5 pr-4 text-right font-normal">Importo</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sectionLines.map((line) => {
                    const r = result.get(line.id);
                    const regime = regimeOf(line.vatRegimeCode);
                    const open = expanded === line.id;
                    const marginBp = r && r.priceCents > 0 ? Math.round((r.marginCents / r.priceCents) * 10000) : null;
                    if (view === "client") {
                      return (
                        <tr key={line.id} className={cn("border-b border-line last:border-0", line.optional && "text-n400")}>
                          <td />
                          <td className="py-2 pr-3">
                            <div className="font-medium">{line.description}</div>
                            {line.detail && <div className="text-[12px] text-n500">{line.detail}</div>}
                          </td>
                          <td className="py-2 text-right tabular">
                            {`${line.pricingModel === "forfait" || line.pricingModel === "percent" ? "a corpo" : `${line.quantity} ${line.unit}`}${
                              line.periods !== 1 ? ` × ${line.periods}${line.periodUnit !== "none" ? ` ${PERIOD_LABELS[line.periodUnit]}` : ""}` : ""
                            }`}
                          </td>
                          <td className="py-2 text-[12px] text-n500">{regime?.kind === "standard" ? `${regime.rateBp / 100}%` : regime?.label}</td>
                          <td className="py-2 pr-4 text-right tabular font-medium">
                            {formatCents(r?.priceCents ?? 0)}
                            {line.optional && <div className="text-[11px] font-normal">opzionale</div>}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <Fragment key={line.id}>
                        <tr className={cn("border-b border-line", open && "bg-paper/60", line.optional && "text-n500")}>
                          <td className="py-1 pl-2 align-top">
                            <button className="mt-1.5 text-n400 hover:text-ink" onClick={() => setExpanded(open ? null : line.id)} title="Dettagli">
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </td>
                          <td className="py-1 pr-2 align-top">
                            <TextInput value={line.description} disabled={readOnly} onCommit={(v) => update(line.id, { description: v || "Voce" })} />
                            <div className="flex items-center gap-1.5 px-1.5 pb-1">
                              <Badge tone={SOURCE[line.costSource].tone}>{SOURCE[line.costSource].label}</Badge>
                              {line.optional && <Badge tone="amber">opzionale</Badge>}
                              {r?.warnings.length ? (
                                <span title={r.warnings.join("\n")} className="text-amber">
                                  <TriangleAlert size={13} />
                                </span>
                              ) : null}
                              {line.costSource === "ai_estimate" && line.estimateMinCents != null && (
                                <span className="text-[11px] text-n500">
                                  {formatCents(line.estimateMinCents, { noCents: true })}–{formatCents(line.estimateMaxCents, { noCents: true })}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1 align-top">
                            <MiniSelect
                              value={line.pricingModel}
                              disabled={readOnly}
                              onChange={(e) => update(line.id, { pricingModel: e.target.value as Line["pricingModel"] })}
                            >
                              {Object.entries(MODEL_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </MiniSelect>
                          </td>
                          <td className="py-1 align-top">
                            {line.pricingModel === "forfait" || line.pricingModel === "percent" ? (
                              <div className="h-8 pr-2 text-right leading-8 text-n400">—</div>
                            ) : (
                              <NumberInput value={line.quantity} disabled={readOnly} onCommit={(v) => update(line.id, { quantity: v ?? 0 })} />
                            )}
                          </td>
                          <td className="py-1 align-top">
                            <div className="flex">
                              <NumberInput
                                value={line.periods}
                                disabled={readOnly}
                                className="w-12"
                                onCommit={(v) => update(line.id, { periods: v || 1 })}
                              />
                              <MiniSelect
                                value={line.periodUnit}
                                disabled={readOnly}
                                onChange={(e) => update(line.id, { periodUnit: e.target.value as Line["periodUnit"] })}
                              >
                                {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </MiniSelect>
                            </div>
                          </td>
                          <td className="py-1 align-top">
                            {line.pricingModel === "unit" || line.pricingModel === "per_pax" ? (
                              <MoneyInput cents={line.unitCostCents} disabled={readOnly} onCommit={(c) => update(line.id, { unitCostCents: c ?? 0 })} />
                            ) : line.pricingModel === "percent" ? (
                              <NumberInput
                                value={(line.percentBp ?? 0) / 100}
                                disabled={readOnly}
                                onCommit={(v) => update(line.id, { percentBp: Math.round((v ?? 0) * 100) })}
                                title="Percentuale sulle voci scelte nei dettagli"
                              />
                            ) : (
                              <MoneyInput cents={line.fixedCostCents} disabled={readOnly} onCommit={(c) => update(line.id, { fixedCostCents: c ?? 0 })} />
                            )}
                            <div className="pr-1.5 text-right text-[11px] text-n500">
                              tot. {formatCents(r?.effectiveCostCents ?? 0)}
                              {line.costIncludesVat ? " lordo" : ""}
                            </div>
                          </td>
                          <td className="py-1 align-top">
                            <NumberInput
                              value={line.markupBp / 100}
                              disabled={readOnly || regime?.allowMarkup === false || line.priceOverrideCents != null}
                              onCommit={(v) => update(line.id, { markupBp: Math.round((v ?? 0) * 100) })}
                            />
                          </td>
                          <td className="py-1 align-top">
                            <MiniSelect
                              value={line.vatRegimeCode}
                              disabled={readOnly}
                              onChange={(e) => {
                                const code = e.target.value;
                                const reg = regimeOf(code);
                                update(line.id, {
                                  vatRegimeCode: code,
                                  ...(reg?.kind === "standard" ? { supplierVatRateBp: reg.rateBp } : {}),
                                });
                              }}
                            >
                              {regimes.map((rg) => (
                                <option key={rg.code} value={rg.code}>
                                  {rg.code === "IVA22" ? "22%" : rg.code === "IVA10" ? "10%" : rg.code === "IVA4" ? "4%" : rg.code === "74TER" ? "74-ter" : rg.code === "ART15" ? "art. 15" : rg.code === "ESENTE" ? "esente" : rg.code === "FC" ? "fuori campo" : rg.code}
                                </option>
                              ))}
                            </MiniSelect>
                          </td>
                          <td className="py-1 text-right align-top">
                            <div className={cn("h-8 pr-1.5 leading-8 tabular font-medium", line.priceOverrideCents != null && "text-violet")}>
                              {formatCents(r?.priceCents ?? 0)}
                            </div>
                          </td>
                          <td className="py-1 pr-2 text-right align-top">
                            <div className={cn("h-8 leading-8 tabular", (r?.marginCents ?? 0) < 0 && "text-warn")}>
                              {formatCents(r?.marginCents ?? 0, { noCents: true })}
                            </div>
                            <div className="text-[11px] text-n500">{marginBp != null ? formatBp(marginBp) : ""}</div>
                          </td>
                          <td className="py-1 pr-2 align-top">
                            {!readOnly && (
                              <div className="flex">
                                <Button variant="ghost" size="sm" title="Duplica" onClick={() => refreshAfter(duplicateLineAction(line.id))}>
                                  <Copy size={13} />
                                </Button>
                                <Button variant="ghost" size="sm" title="Elimina" onClick={() => refreshAfter(deleteLineAction(line.id))}>
                                  <Trash size={13} />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-line bg-paper/60">
                            <td />
                            <td colSpan={10} className="px-1 pt-1 pb-3">
                              <LineDetails line={line} lines={lines} readOnly={readOnly} update={update} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!readOnly && view === "internal" && (
              <div className="px-4 py-2">
                <Button variant="ghost" size="sm" onClick={() => refreshAfter(addLineAction(quote.id, section.id))}>
                  <Plus size={13} /> Aggiungi voce
                </Button>
              </div>
            )}
          </section>
        );
      })}
    </div>
    <TotalsPanel totals={totals} view={view} lineNames={new Map(lines.map((l) => [l.id, l.description]))} />
    </div>
  );
}

function LineDetails({
  line,
  lines,
  readOnly,
  update,
}: {
  line: Line;
  lines: Line[];
  readOnly: boolean;
  update: (id: string, patch: Partial<Line>) => void;
}) {
  const field = "flex flex-col gap-1 text-[12px] text-n500";
  return (
    <div className="grid grid-cols-2 gap-3 rounded-sm border border-line bg-card p-3 md:grid-cols-4">
      <label className={cn(field, "col-span-2")}>
        Dettaglio visibile al cliente
        <textarea
          defaultValue={line.detail ?? ""}
          disabled={readOnly}
          onBlur={(e) => update(line.id, { detail: e.target.value.trim() || null })}
          className="min-h-14 rounded-xs border border-line-2 px-2 py-1 text-[13px] text-ink"
        />
      </label>
      <label className={cn(field, "col-span-2")}>
        Note interne
        <textarea
          defaultValue={line.notes ?? ""}
          disabled={readOnly}
          onBlur={(e) => update(line.id, { notes: e.target.value.trim() || null })}
          className="min-h-14 rounded-xs border border-line-2 px-2 py-1 text-[13px] text-ink"
        />
      </label>
      <label className={field}>
        Unità
        <TextInput value={line.unit} disabled={readOnly} onCommit={(v) => update(line.id, { unit: v || "n." })} className="border-line-2" />
      </label>
      <label className={field}>
        IVA del fornitore sul costo
        <MiniSelect
          value={line.supplierVatRateBp}
          disabled={readOnly}
          className="border-line-2"
          onChange={(e) => update(line.id, { supplierVatRateBp: Number(e.target.value) })}
        >
          <option value={2200}>22%</option>
          <option value={1000}>10%</option>
          <option value={400}>4%</option>
          <option value={0}>0%</option>
        </MiniSelect>
      </label>
      <label className="flex items-center gap-2 text-[12px] text-n700">
        <input type="checkbox" checked={line.costIncludesVat} disabled={readOnly} onChange={(e) => update(line.id, { costIncludesVat: e.target.checked })} />
        Costo IVA inclusa
      </label>
      <label className="flex items-center gap-2 text-[12px] text-n700">
        <input type="checkbox" checked={line.optional} disabled={readOnly} onChange={(e) => update(line.id, { optional: e.target.checked })} />
        Voce opzionale (fuori totale)
      </label>
      <label className={field}>
        Prezzo forzato (vuoto = calcolato)
        <MoneyInput
          cents={line.priceOverrideCents}
          nullable
          disabled={readOnly}
          className="border-line-2"
          onCommit={(c) => update(line.id, { priceOverrideCents: c })}
        />
      </label>
      <label className={field}>
        Origine del costo
        <MiniSelect
          value={line.costSource}
          disabled={readOnly}
          className="border-line-2"
          onChange={(e) => update(line.id, { costSource: e.target.value as Line["costSource"] })}
        >
          <option value="manual">manuale</option>
          <option value="benchmark">listino</option>
          <option value="ai_estimate">stima AI</option>
          <option value="supplier_quote">preventivo fornitore</option>
        </MiniSelect>
      </label>
      {line.pricingModel === "package" && (
        <>
          <label className={field}>
            Inclusi nel pacchetto (fino a)
            <NumberInput
              value={line.includedQuantity}
              nullable
              disabled={readOnly}
              className="border-line-2"
              onCommit={(v) => update(line.id, { includedQuantity: v })}
            />
          </label>
          <label className={field}>
            Costo per unità oltre la soglia
            <MoneyInput
              cents={line.extraUnitCostCents}
              nullable
              disabled={readOnly}
              className="border-line-2"
              onCommit={(c) => update(line.id, { extraUnitCostCents: c })}
            />
          </label>
        </>
      )}
      {line.pricingModel === "percent" && (
        <label className={cn(field, "col-span-2")}>
          Percentuale calcolata sulle voci
          <select
            multiple
            disabled={readOnly}
            value={line.percentOfLineIds ?? []}
            onChange={(e) => update(line.id, { percentOfLineIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
            className="min-h-24 rounded-xs border border-line-2 text-[13px] text-ink"
          >
            {lines
              .filter((l) => l.id !== line.id && l.pricingModel !== "percent")
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description}
                </option>
              ))}
          </select>
        </label>
      )}
    </div>
  );
}
