import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { Download, Mail, Phone, Search } from "lucide-react";
import { hasApiKey } from "@/ai/qwen";
import { getDb, schema } from "@/db/client";
import { computeForQuote, currentQuote } from "@/db/queries/quotes";
import {
  addLinkAction,
  draftRfqAction,
  logInteractionAction,
  removeLinkAction,
  saveSupplierQuoteAction,
  searchSuppliersAction,
  setLinkStatusAction,
} from "@/server/supplier-links";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { SUPPLIER_KIND_LABELS, formatDate, formatDateTime } from "@/lib/labels";
import { formatCents } from "@/lib/money";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  to_contact: { label: "Da contattare", tone: "neutral" },
  contacted: { label: "Contattato", tone: "violet" },
  quote_received: { label: "Preventivo ricevuto", tone: "amber" },
  confirmed: { label: "Confermato", tone: "ok" },
  discarded: { label: "Scartato", tone: "warn" },
};
const SOURCE: Record<string, { label: string; tone: Tone }> = {
  manual: { label: "manuale", tone: "neutral" },
  benchmark: { label: "listino", tone: "violet" },
  ai_estimate: { label: "stima AI", tone: "amber" },
  supplier_quote: { label: "fornitore", tone: "ok" },
};
const CHANNELS = { phone: "Telefono", email: "Email", whatsapp: "WhatsApp", meeting: "Incontro", other: "Altro" };

export default async function ProjectSuppliersPage(props: PageProps<"/projects/[id]/suppliers">) {
  const { id } = await props.params;
  const db = getDb();
  const aiReady = hasApiKey();
  const quote = currentQuote(id);
  if (!quote) return <EmptyState title="Prima il preventivo">I fornitori si collegano alle voci del preventivo.</EmptyState>;
  const computed = computeForQuote(quote.id)!;
  const result = new Map(computed.totals.lines.map((l) => [l.id, l]));
  const lineIds = computed.lines.map((l) => l.id);
  const links = lineIds.length
    ? db
        .select({ link: schema.supplierLinks, supplier: schema.suppliers })
        .from(schema.supplierLinks)
        .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierLinks.supplierId))
        .where(inArray(schema.supplierLinks.quoteLineId, lineIds))
        .all()
    : [];
  const supplierIds = [...new Set(links.map((l) => l.supplier.id))];
  const contacts = supplierIds.length
    ? db.select().from(schema.supplierContacts).where(inArray(schema.supplierContacts.supplierId, supplierIds)).all()
    : [];
  const linkIds = links.map((l) => l.link.id);
  const interactions = linkIds.length
    ? db.select().from(schema.supplierInteractions).where(inArray(schema.supplierInteractions.linkId, linkIds)).orderBy(desc(schema.supplierInteractions.at)).all()
    : [];
  const drafts = linkIds.length ? db.select().from(schema.rfqDrafts).where(inArray(schema.rfqDrafts.linkId, linkIds)).orderBy(desc(schema.rfqDrafts.createdAt)).all() : [];
  const allSuppliers = db.select({ id: schema.suppliers.id, name: schema.suppliers.name, kind: schema.suppliers.kind }).from(schema.suppliers).orderBy(asc(schema.suppliers.kind), asc(schema.suppliers.name)).all();

  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, links.filter((l) => l.link.status === k).length]));
  const withoutSupplier = computed.lines.filter((l) => !links.some((x) => x.link.quoteLineId === l.id)).length;
  const sections = [...computed.sections].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {Object.entries(STATUS).map(([k, v]) => (
          <Badge key={k} tone={v.tone}>
            {v.label}: {counts[k]}
          </Badge>
        ))}
        <span className="text-n500">· {withoutSupplier} voci senza fornitore</span>
        <span className="ml-auto text-n500">
          Costi ancora stimati: {Math.round(computed.totals.aiEstimateShareBp / 100)}% · <Link href={`/projects/${id}/quote`} className="text-violet hover:underline">{quote.number}</Link>
        </span>
      </div>

      {sections.map((section) => {
        const lines = computed.lines.filter((l) => l.sectionId === section.id).sort((a, b) => a.position - b.position);
        if (!lines.length) return null;
        return (
          <Card key={section.id}>
            <div className="border-b border-line px-5 py-2.5 font-semibold">{section.title}</div>
            <div className="divide-y divide-line">
              {lines.map((line) => {
                const r = result.get(line.id);
                const lineLinks = links.filter((l) => l.link.quoteLineId === line.id);
                return (
                  <div key={line.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{line.description}</span>
                      <Badge tone={SOURCE[line.costSource].tone}>{SOURCE[line.costSource].label}</Badge>
                      <span className="text-[12px] text-n500">
                        costo {formatCents(r?.effectiveCostCents ?? 0)}
                        {line.costSource === "ai_estimate" && line.estimateMinCents != null && ` (forchetta ${formatCents(line.estimateMinCents, { noCents: true })}–${formatCents(line.estimateMaxCents, { noCents: true })})`}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        {aiReady && (
                          <form action={searchSuppliersAction.bind(null, id, line.id)}>
                            <SubmitButton variant="ghost" size="sm" pendingLabel="In coda…">
                              <Search size={13} /> Cerca online
                            </SubmitButton>
                          </form>
                        )}
                        <form action={addLinkAction.bind(null, id, line.id)} className="flex items-center gap-1">
                          <Select name="supplierId" className="h-8 w-56 text-[12px]" defaultValue="">
                            <option value="">Aggiungi dalla rubrica…</option>
                            {allSuppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {SUPPLIER_KIND_LABELS[s.kind]} · {s.name}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton variant="secondary" size="sm">
                            Collega
                          </SubmitButton>
                        </form>
                      </div>
                    </div>

                    {lineLinks.length === 0 && <div className="mt-2 text-[12px] text-n500">Nessun fornitore collegato.</div>}
                    <div className="mt-2 flex flex-col gap-2">
                      {lineLinks.map(({ link, supplier }) => {
                        const phones = contacts.filter((c) => c.supplierId === supplier.id && (c.type === "phone" || c.type === "mobile") && c.status !== "invalid").sort((a, b) => Number(b.status === "verified") - Number(a.status === "verified"));
                        const email = contacts.find((c) => c.supplierId === supplier.id && c.type === "email" && c.status !== "invalid");
                        const log = interactions.filter((x) => x.linkId === link.id).slice(0, 3);
                        const draft = drafts.find((d) => d.linkId === link.id);
                        return (
                          <div key={link.id} className="rounded-sm border border-line bg-paper/50 p-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <Link href={`/library/suppliers/${supplier.id}`} className="font-medium hover:text-violet">
                                {supplier.name}
                              </Link>
                              <span className="text-[12px] text-n500">
                                {SUPPLIER_KIND_LABELS[supplier.kind]}
                                {supplier.city ? ` · ${supplier.city}` : ""}
                              </span>
                              {phones.slice(0, 2).map((p) => (
                                <a key={p.id} href={`tel:${p.value}`} className="inline-flex items-center gap-1 text-[13px] text-violet hover:underline" title={p.status === "verified" ? "Verificato sulla fonte" : "Da verificare"}>
                                  <Phone size={12} /> {p.display}
                                  {p.status !== "verified" && <span className="text-[11px] text-[#8a5a00]">(da verificare)</span>}
                                </a>
                              ))}
                              {phones.length === 0 && <span className="text-[12px] text-[#8a5a00]">telefono da trovare</span>}
                              {email && (
                                <a href={`mailto:${email.value}`} className="inline-flex items-center gap-1 text-[13px] text-violet hover:underline">
                                  <Mail size={12} /> {email.value}
                                </a>
                              )}
                              <form action={setLinkStatusAction.bind(null, link.id)} className="ml-auto flex items-center gap-1">
                                <Select name="status" defaultValue={link.status} className="h-7 w-44 px-2 text-[12px]">
                                  {Object.entries(STATUS).map(([k, v]) => (
                                    <option key={k} value={k}>
                                      {v.label}
                                    </option>
                                  ))}
                                </Select>
                                <SubmitButton variant="ghost" size="sm">
                                  OK
                                </SubmitButton>
                              </form>
                              <form action={removeLinkAction.bind(null, link.id)}>
                                <SubmitButton variant="ghost" size="sm">
                                  ✕
                                </SubmitButton>
                              </form>
                            </div>
                            {link.notes && <div className="mt-1 text-[12px] text-n500">{link.notes}</div>}

                            <div className="mt-2 grid gap-3 lg:grid-cols-2">
                              <form action={saveSupplierQuoteAction.bind(null, link.id)} className="flex flex-wrap items-center gap-2 text-[12px]">
                                <Input name="cost" defaultValue={link.quotedCostCents != null ? (link.quotedCostCents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 }) : ""} placeholder="Prezzo del fornitore €" className="h-8 w-40" />
                                <label className="flex items-center gap-1">
                                  <input type="checkbox" name="includesVat" defaultChecked={link.quotedCostIncludesVat} /> IVA inclusa
                                </label>
                                <Input name="optionExpiresAt" type="date" defaultValue={link.optionExpiresAt ?? ""} title="Scadenza dell'opzione" className="h-8 w-36" />
                                <Input name="notes" defaultValue={link.notes ?? ""} placeholder="Condizioni, note" className="h-8 min-w-40 flex-1" />
                                <label className="flex items-center gap-1" title="Il costo della voce diventa quello del fornitore e il prezzo entra nel listino">
                                  <input type="checkbox" name="apply" /> usa nel preventivo
                                </label>
                                <SubmitButton variant="secondary" size="sm">
                                  Salva
                                </SubmitButton>
                                {link.optionExpiresAt && <span className="text-n500">opzione fino al {formatDate(link.optionExpiresAt)}</span>}
                              </form>
                              <div className="flex flex-col gap-1 text-[12px]">
                                <form action={logInteractionAction.bind(null, link.id)} className="flex items-center gap-1">
                                  <Select name="channel" defaultValue="phone" className="h-8 w-28 px-2 text-[12px]">
                                    {Object.entries(CHANNELS).map(([k, v]) => (
                                      <option key={k} value={k}>
                                        {v}
                                      </option>
                                    ))}
                                  </Select>
                                  <Input name="outcome" placeholder="Esito del contatto" className="h-8 flex-1" />
                                  <SubmitButton variant="ghost" size="sm">
                                    Registra
                                  </SubmitButton>
                                </form>
                                {log.map((x) => (
                                  <div key={x.id} className="text-n500">
                                    {formatDateTime(x.at)} · {CHANNELS[x.channel]}: {x.outcome ?? "—"}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {aiReady && (
                                <form action={draftRfqAction.bind(null, link.id)}>
                                  <SubmitButton variant="ghost" size="sm" pendingLabel="In coda…">
                                    {draft ? "Riscrivi la richiesta" : "Prepara la richiesta di preventivo"}
                                  </SubmitButton>
                                </form>
                              )}
                              {draft && (
                                <details className="w-full rounded-xs border border-line bg-card px-3 py-2 text-[12px]">
                                  <summary className="cursor-pointer font-medium">Richiesta: {draft.subject}</summary>
                                  <div className="mt-2 whitespace-pre-wrap leading-relaxed text-n700">{draft.body}</div>
                                  <div className="mt-2 flex gap-2">
                                    <CopyButton text={`${draft.subject}\n\n${draft.body}`} />
                                    <a
                                      href={`mailto:${email?.value ?? ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-violet px-3 text-white"
                                    >
                                      <Mail size={13} /> Apri nella mail
                                    </a>
                                    <a href={`/api/rfq/${draft.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-2 px-3">
                                      <Download size={13} /> .eml
                                    </a>
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
