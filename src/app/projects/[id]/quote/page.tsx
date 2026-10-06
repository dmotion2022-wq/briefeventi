import Link from "next/link";
import { FileSpreadsheet, Lock } from "lucide-react";
import { currentQuote, getQuoteFull, quotesForProject } from "@/db/queries/quotes";
import {
  addSectionAction,
  createQuoteAction,
  markSentAction,
  newRevisionAction,
  updateQuoteSettingsAction,
} from "@/server/quotes";
import { QuoteEditor } from "@/components/quote/quote-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/labels";

const STATUS = {
  draft: { label: "Bozza", tone: "neutral" },
  sent: { label: "Inviato", tone: "violet" },
  accepted: { label: "Accettato", tone: "ok" },
  rejected: { label: "Rifiutato", tone: "warn" },
  superseded: { label: "Sostituito", tone: "neutral" },
} as const;

export default async function QuotePage(props: PageProps<"/projects/[id]/quote">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const view = sp.view === "client" ? "client" : "internal";
  const all = quotesForProject(id);
  const selected = typeof sp.q === "string" ? all.find((q) => q.id === sp.q) : currentQuote(id);

  if (!selected) {
    return (
      <EmptyState
        title="Nessun preventivo"
        action={
          <form action={createQuoteAction.bind(null, id)}>
            <SubmitButton>Crea il preventivo</SubmitButton>
          </form>
        }
      >
        Parte con le sezioni standard (location, ospitalità, F&amp;B, trasporti, produzione…). Quando la proposta è sviluppata,
        le voci si possono generare dai componenti con le stime del listino.
      </EmptyState>
    );
  }

  const full = getQuoteFull(selected.id)!;
  const q = full.quote;
  const readOnly = q.status !== "draft";
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(sp.q ? { q: String(sp.q) } : {}), view, ...extra })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="eyebrow">
            {q.number}
            {q.revision > 1 && ` · rev. ${q.revision}`} · {formatDate(q.date)}
          </div>
          <div className="text-[16px] font-semibold">{q.title}</div>
        </div>
        <Badge tone={STATUS[q.status].tone}>{STATUS[q.status].label}</Badge>
        {readOnly && (
          <span className="inline-flex items-center gap-1 text-[12px] text-n500">
            <Lock size={12} /> bloccato: crea una revisione per modificarlo
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-sm border border-line-2 bg-card p-0.5 text-[13px]">
            {(["internal", "client"] as const).map((v) => (
              <Link
                key={v}
                href={qs({ view: v })}
                className={cn("rounded-xs px-3 py-1", view === v ? "bg-ink text-paper" : "text-n700 hover:bg-n100")}
              >
                {v === "internal" ? "Interna" : "Cliente"}
              </Link>
            ))}
          </div>
          <a href={`/api/quotes/${q.id}/xlsx?variant=client`} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-2 bg-card px-3 text-[13px] hover:bg-n100">
            <FileSpreadsheet size={14} /> Excel cliente
          </a>
          <a href={`/api/quotes/${q.id}/xlsx?variant=internal`} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-2 bg-card px-3 text-[13px] hover:bg-n100">
            <FileSpreadsheet size={14} /> Excel interno
          </a>
          <form action={newRevisionAction.bind(null, q.id)}>
            <Button variant="secondary" size="sm">
              Nuova revisione
            </Button>
          </form>
          {q.status === "draft" && (
            <form action={markSentAction.bind(null, q.id)}>
              <Button size="sm">Segna come inviato</Button>
            </form>
          )}
        </div>
      </div>

      {all.length > 1 && (
        <div className="flex flex-wrap gap-2 text-[12px]">
          <span className="text-n500">Revisioni:</span>
          {[...all].reverse().map((r) => (
            <Link key={r.id} href={`?q=${r.id}&view=${view}`} className={cn("rounded-xs px-2 py-0.5", r.id === q.id ? "bg-violet-soft text-violet" : "bg-n100 hover:bg-n200")}>
              rev. {r.revision} · {STATUS[r.status].label.toLowerCase()}
            </Link>
          ))}
        </div>
      )}

      {view === "internal" && !readOnly && (
        <details className="rounded-lg border border-line bg-card shadow-sm">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium">Impostazioni del preventivo</summary>
          <form action={updateQuoteSettingsAction.bind(null, q.id)} className="grid grid-cols-2 gap-3 border-t border-line p-4 md:grid-cols-4">
            <Field label="Titolo" className="col-span-2">
              <Input name="title" defaultValue={q.title} />
            </Field>
            <Field label="Data">
              <Input name="date" type="date" defaultValue={q.date} />
            </Field>
            <Field label="Validità (giorni)">
              <Input name="validityDays" type="number" defaultValue={q.validityDays} />
            </Field>
            <Field label="Fee d'agenzia %">
              <Input name="agencyFeePercent" inputMode="decimal" defaultValue={q.agencyFeeBp / 100} />
            </Field>
            <Field label="Imprevisti %">
              <Input name="contingencyPercent" inputMode="decimal" defaultValue={q.contingencyBp / 100} />
            </Field>
            <Field label="Imprevisti">
              <Select name="contingencyMode" defaultValue={q.contingencyMode}>
                <option value="internal">solo interni (riducono il margine)</option>
                <option value="client_line">voce visibile al cliente</option>
              </Select>
            </Field>
            <Field label="Arrotondamento prezzi">
              <Select name="rounding" defaultValue={q.rounding}>
                <option value="none">al centesimo</option>
                <option value="unit_1">all&apos;euro</option>
                <option value="unit_10">ai 10 euro</option>
              </Select>
            </Field>
            <Field label="Tranche di pagamento (una per riga, “descrizione: %”)" className="col-span-2">
              <Textarea name="tranches" defaultValue={(q.paymentTranches ?? []).map((t) => `${t.label}: ${t.percentBp / 100}`).join("\n")} />
            </Field>
            <Field label="Note e condizioni (una per riga)" className="col-span-2">
              <Textarea name="notes" defaultValue={(q.notes ?? []).join("\n")} />
            </Field>
            <div className="col-span-2 flex justify-end md:col-span-4">
              <SubmitButton variant="secondary">Salva le impostazioni</SubmitButton>
            </div>
          </form>
        </details>
      )}

      <QuoteEditor
        key={q.id}
        quote={q}
        sections={full.sections}
        initialLines={full.lines}
        regimes={full.regimes}
        view={view}
        readOnly={readOnly}
      />

      {view === "internal" && !readOnly && (
        <form action={addSectionAction.bind(null, q.id)} className="flex items-center gap-2">
          <Input name="title" placeholder="Nuova sezione" className="w-64" />
          <label className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" name="optional" /> opzionale
          </label>
          <SubmitButton variant="secondary" size="sm">
            Aggiungi sezione
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
