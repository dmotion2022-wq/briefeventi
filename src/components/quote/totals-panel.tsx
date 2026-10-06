"use client";

import { TriangleAlert } from "lucide-react";
import type { QuoteTotals } from "@/domain/quote/engine";
import { cn } from "@/lib/cn";
import { formatBp, formatCents } from "@/lib/money";

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-0.5 text-[13px]", strong && "font-semibold", muted && "text-n500")}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

export function TotalsPanel({
  totals,
  view,
  lineNames,
}: {
  totals: QuoteTotals;
  view: "internal" | "client";
  lineNames: Map<string, string>;
}) {
  const t = totals;
  return (
    <aside className="sticky top-4 flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
        <div className="eyebrow mb-2">Totale cliente</div>
        <div className="font-display text-3xl font-bold tracking-tight">{formatCents(t.clientTotalCents)}</div>
        <div className="mt-3 border-t border-line pt-2">
          {t.vatSummary.map((v) => (
            <div key={v.code}>
              <Row label={`Imponibile ${v.rateBp / 100}%`} value={formatCents(v.taxableCents)} />
              <Row label={`IVA ${v.rateBp / 100}%`} value={formatCents(v.vatCents)} muted />
            </div>
          ))}
          {t.margin74ter.priceCents > 0 && <Row label="Servizi 74-ter (IVA non esposta)" value={formatCents(t.margin74ter.priceCents)} />}
          {t.art15Cents > 0 && <Row label="Spese anticipate art. 15" value={formatCents(t.art15Cents)} />}
          {t.exemptCents > 0 && <Row label="Esente" value={formatCents(t.exemptCents)} />}
          {t.outOfScopeCents > 0 && <Row label="Fuori campo IVA" value={formatCents(t.outOfScopeCents)} />}
          {t.agencyFeeCents > 0 && <Row label="di cui fee d'agenzia" value={formatCents(t.agencyFeeCents)} muted />}
          {t.contingencyMode === "client_line" && t.contingencyCents > 0 && (
            <Row label="di cui imprevisti" value={formatCents(t.contingencyCents)} muted />
          )}
          {t.optionalPriceCents > 0 && <Row label="Opzioni (fuori totale)" value={formatCents(t.optionalPriceCents)} muted />}
        </div>
        {t.tranches.length > 0 && (
          <div className="mt-3 border-t border-line pt-2">
            {t.tranches.map((tr, i) => (
              <Row key={i} label={`${tr.label} (${tr.percentBp / 100}%)`} value={formatCents(tr.amountCents)} muted />
            ))}
          </div>
        )}
      </div>

      {view === "internal" && (
        <div className="rounded-lg border border-ink bg-ink p-4 text-paper shadow-sm">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-n400">Vista interna</div>
          <Row label="Costi" value={formatCents(t.costCents)} />
          <Row label="Ricavi netti" value={formatCents(t.revenueNetCents)} />
          {t.margin74ter.vatOnMarginCents > 0 && <Row label="IVA sul margine 74-ter" value={`− ${formatCents(t.margin74ter.vatOnMarginCents)}`} />}
          {t.contingencyMode === "internal" && t.contingencyCents > 0 && (
            <Row label="Imprevisti accantonati" value={`− ${formatCents(t.contingencyCents)}`} />
          )}
          <div className="mt-2 border-t border-n700 pt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px]">Margine previsto</span>
              <span className={cn("font-display text-2xl font-bold", t.marginCents < 0 ? "text-magenta" : "text-amber")}>
                {formatCents(t.marginCents, { noCents: true })}
              </span>
            </div>
            <div className="text-right font-mono text-[12px] text-n400">{t.marginBp != null ? formatBp(t.marginBp) : "—"} sui ricavi</div>
          </div>
          <div className="mt-2 border-t border-n700 pt-2 text-[12px] text-n300">
            Costi ancora stimati dall&apos;AI: {formatBp(t.aiEstimateShareBp)}
            {t.costRangeCents.max !== t.costRangeCents.min && (
              <div>
                Forchetta costi: {formatCents(t.costRangeCents.min, { noCents: true })} – {formatCents(t.costRangeCents.max, { noCents: true })}
              </div>
            )}
          </div>
        </div>
      )}

      {view === "internal" && t.warnings.length > 0 && (
        <div className="rounded-lg border border-amber/60 bg-amber-soft p-3 text-[12px] text-[#6b4700]">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <TriangleAlert size={13} /> Da controllare
          </div>
          <ul className="space-y-1">
            {t.warnings.map((w, i) => {
              const [id, ...rest] = w.split(": ");
              const name = lineNames.get(id);
              return <li key={i}>{name ? `${name}: ${rest.join(": ")}` : w}</li>;
            })}
          </ul>
        </div>
      )}
      <p className="text-[11px] leading-snug text-n500">
        Regimi IVA (74-ter, art. 15, aliquote ridotte) configurabili in Impostazioni: da validare con il commercialista.
      </p>
    </aside>
  );
}
