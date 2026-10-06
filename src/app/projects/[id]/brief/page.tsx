import { CircleCheck, FileText, TriangleAlert, Trash } from "lucide-react";
import { hasApiKey } from "@/ai/qwen";
import { latestBrief, projectDocuments } from "@/ai/context";
import type { BriefData } from "@/ai/schemas/brief";
import { addDocumentsAction, confirmBriefAction, deleteDocumentAction, runTask, updateBriefAction } from "@/server/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { UploadField } from "@/components/upload-field";
import { usesBlob } from "@/lib/storage";
import { formatDate } from "@/lib/labels";
import { requireUser } from "@/auth/session";

type Evidence = BriefData["evidence"][number] & { verified?: boolean };

const FIELD_LABELS: Record<string, string> = {
  cliente: "Cliente",
  tipo_evento: "Tipo di evento",
  obiettivi: "Obiettivi",
  pubblico: "Pubblico",
  partecipanti: "Partecipanti",
  date: "Date",
  luogo: "Luogo",
  budget: "Budget",
  formato: "Formato",
  servizi_richiesti: "Servizi richiesti",
  tono: "Tono",
  gara: "Gara",
  criteri_valutazione: "Criteri di valutazione",
  scadenze: "Scadenze",
  vincoli: "Vincoli",
};

function List({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-n400">—</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-[13px]">{children ?? <span className="text-n400">—</span>}</div>
    </div>
  );
}

const euro = (n: number | null) =>
  n == null ? null : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export default async function BriefPage(props: PageProps<"/projects/[id]/brief">) {
  await requireUser();
  const { id } = await props.params;
  const [docs, brief] = await Promise.all([projectDocuments(id), latestBrief(id)]);
  const data = brief?.data as (Omit<BriefData, "evidence"> & { evidence: Evidence[] }) | undefined;
  const aiReady = hasApiKey();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        {!data ? (
          <EmptyState
            title={docs.length ? "Brief da analizzare" : "Aggiungi il brief"}
            action={
              docs.length && aiReady ? (
                <form action={runTask.bind(null, id, "brief.extract")}>
                  <SubmitButton>Analizza il brief</SubmitButton>
                </form>
              ) : null
            }
          >
            {!docs.length
              ? "Incolla il testo o carica i documenti nel riquadro a destra."
              : aiReady
                ? "L'analisi estrae i dati del brief con la citazione della fonte."
                : "Manca la chiave Qwen: incollala in Impostazioni (una volta sola) e torna qui per lanciare l'analisi."}
          </EmptyState>
        ) : (
          <>
            <Card>
              <CardHeader
                eyebrow={`Versione ${brief!.version} · ${brief!.status === "confirmed" ? `confermato il ${formatDate(brief!.confirmedAt)}` : "bozza"}`}
                title={data.eventTitle ?? data.eventType}
                actions={
                  <>
                    {aiReady && (
                      <form action={runTask.bind(null, id, "brief.extract")}>
                        <SubmitButton variant="ghost" size="sm">
                          Rianalizza
                        </SubmitButton>
                      </form>
                    )}
                    {brief!.status !== "confirmed" && (
                      <form action={confirmBriefAction.bind(null, id, brief!.id)}>
                        <Button size="sm">Conferma il brief</Button>
                      </form>
                    )}
                  </>
                }
              />
              <CardBody className="flex flex-col gap-5">
                <p className="text-[14px] leading-relaxed">{data.summary}</p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Fact label="Partecipanti">
                    {data.audience.paxTarget ?? data.audience.paxMax
                      ? `${data.audience.paxMin && data.audience.paxMin !== data.audience.paxMax ? `${data.audience.paxMin}–` : ""}${data.audience.paxTarget ?? data.audience.paxMax}`
                      : null}
                  </Fact>
                  <Fact label="Date">
                    {data.dates.start
                      ? `${formatDate(data.dates.start)}${data.dates.end && data.dates.end !== data.dates.start ? ` → ${formatDate(data.dates.end)}` : ""}`
                      : data.dates.flexibility}
                  </Fact>
                  <Fact label="Luogo">{[data.location.city, data.location.region, data.location.country].filter(Boolean).join(", ") || null}</Fact>
                  <Fact label="Budget">
                    {euro(data.budget.totalEuro) ?? (data.budget.perPaxEuro ? `${euro(data.budget.perPaxEuro)} a persona` : data.budget.notes)}
                  </Fact>
                  <Fact label="Formato">{data.format.replace("_", " ")}</Fact>
                  <Fact label="Pubblico">{data.audience.profiles.join(", ") || data.audience.description}</Fact>
                  <Fact label="Tono">{data.tone}</Fact>
                  <Fact label="Gara">{data.tender.isTender ? `sì${data.tender.deadline ? `, entro ${data.tender.deadline}` : ""}` : "no"}</Fact>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Fact label="Obiettivi">
                    <List items={data.objectives} />
                  </Fact>
                  <Fact label="Messaggi chiave">
                    <List items={data.keyMessages} />
                  </Fact>
                  <Fact label="Servizi richiesti">
                    <List items={data.requiredServices} />
                  </Fact>
                  <Fact label="Vincoli">
                    <List items={data.constraints} />
                  </Fact>
                </div>
                {data.tender.isTender && (
                  <div>
                    <div className="eyebrow mb-1">Criteri di valutazione della gara</div>
                    {data.tender.evaluationCriteria.length ? (
                      <table className="w-full text-[13px]">
                        <tbody>
                          {data.tender.evaluationCriteria.map((c, i) => (
                            <tr key={i} className="border-b border-line last:border-0">
                              <td className="py-1.5 pr-3">{c.criterion}</td>
                              <td className="py-1.5 pr-3 tabular text-right font-medium">{c.weight ?? "—"}</td>
                              <td className="py-1.5 text-n500">{c.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <span className="text-[13px] text-n400">Non indicati</span>
                    )}
                    {data.tender.deliverables.length > 0 && (
                      <div className="mt-2 text-[13px]">
                        <span className="text-n500">Da consegnare: </span>
                        {data.tender.deliverables.join(" · ")}
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Da dove vengono i dati"
                description="Ogni citazione è controllata sul testo dei documenti: se non si ritrova, è segnalata."
              />
              <div className="divide-y divide-line">
                {data.evidence.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-2.5 text-[13px]">
                    {e.verified ? (
                      <CircleCheck size={15} className="mt-0.5 shrink-0 text-ok" />
                    ) : (
                      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{FIELD_LABELS[e.field] ?? e.field}</span>
                      {e.page ? <span className="text-n500"> · pag. {e.page}</span> : null}
                      {!e.verified && <span className="text-[#8a5a00]"> · citazione non ritrovata, da controllare</span>}
                      <div className="mt-0.5 italic text-n700">“{e.quote}”</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <details className="rounded-lg border border-line bg-card shadow-sm">
              <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold">Correggi i dati del brief</summary>
              <form action={updateBriefAction.bind(null, id, brief!.id)} className="grid grid-cols-2 gap-3 border-t border-line px-5 py-4">
                <Field label="Sintesi" className="col-span-2">
                  <Textarea name="summary" defaultValue={data.summary} />
                </Field>
                <Field label="Tipo di evento">
                  <Input name="eventType" defaultValue={data.eventType} />
                </Field>
                <Field label="Tono">
                  <Input name="tone" defaultValue={data.tone ?? ""} />
                </Field>
                <div className="col-span-2 grid grid-cols-3 gap-3">
                  <Field label="Pax min">
                    <Input name="paxMin" type="number" defaultValue={data.audience.paxMin ?? ""} />
                  </Field>
                  <Field label="Pax previsti">
                    <Input name="paxTarget" type="number" defaultValue={data.audience.paxTarget ?? ""} />
                  </Field>
                  <Field label="Pax max">
                    <Input name="paxMax" type="number" defaultValue={data.audience.paxMax ?? ""} />
                  </Field>
                </div>
                <Field label="Inizio">
                  <Input name="start" type="date" defaultValue={data.dates.start ?? ""} />
                </Field>
                <Field label="Fine">
                  <Input name="end" type="date" defaultValue={data.dates.end ?? ""} />
                </Field>
                <Field label="Città">
                  <Input name="city" defaultValue={data.location.city ?? ""} />
                </Field>
                <Field label="Regione">
                  <Input name="region" defaultValue={data.location.region ?? ""} />
                </Field>
                <Field label="Budget totale (€)">
                  <Input name="budgetTotal" inputMode="decimal" defaultValue={data.budget.totalEuro ?? ""} />
                </Field>
                <Field label="Budget a persona (€)">
                  <Input name="budgetPerPax" inputMode="decimal" defaultValue={data.budget.perPaxEuro ?? ""} />
                </Field>
                <Field label="Obiettivi (uno per riga)" className="col-span-2">
                  <Textarea name="objectives" defaultValue={data.objectives.join("\n")} />
                </Field>
                <Field label="Servizi richiesti (uno per riga)">
                  <Textarea name="requiredServices" defaultValue={data.requiredServices.join("\n")} />
                </Field>
                <Field label="Vincoli (uno per riga)">
                  <Textarea name="constraints" defaultValue={data.constraints.join("\n")} />
                </Field>
                <div className="col-span-2 flex justify-end">
                  <SubmitButton variant="secondary">Salva le correzioni</SubmitButton>
                </div>
              </form>
            </details>
          </>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Documenti" />
          <div className="divide-y divide-line">
            {docs.length === 0 && <div className="px-5 py-4 text-[13px] text-n500">Nessun documento.</div>}
            {docs.map(({ document: d, pages }) => (
              <div key={d.id} className="flex items-start gap-2 px-5 py-2.5 text-[13px]">
                <FileText size={15} className="mt-0.5 shrink-0 text-n500" />
                <div className="min-w-0 flex-1">
                  <a href={`/api/documents/${d.id}`} target="_blank" className="block truncate font-medium hover:text-violet">
                    {d.filename}
                  </a>
                  <div className="text-[12px] text-n500">
                    {pages.length} {pages.length === 1 ? "pagina" : "pagine"}
                    {d.extractionStatus === "ocr_needed" && " · pagine senza testo: serve OCR"}
                  </div>
                </div>
                {d.extractionStatus === "ocr_needed" && <Badge tone="amber">OCR</Badge>}
                <form action={deleteDocumentAction.bind(null, id, d.id)}>
                  <button className="text-n400 hover:text-warn" title="Rimuovi">
                    <Trash size={14} />
                  </button>
                </form>
              </div>
            ))}
          </div>
          <CardBody className="border-t border-line bg-paper/50">
            <form action={addDocumentsAction.bind(null, id)} className="flex flex-col gap-2">
              <Textarea name="briefText" placeholder="Altro testo (risposte del cliente, email…)" className="min-h-20" />
              <UploadField online={usesBlob()} className="text-[12px] file:mr-2 file:rounded-sm file:border-0 file:bg-n100 file:px-2 file:py-1.5" />
              <SubmitButton variant="secondary" size="sm" pendingLabel="Caricamento…">
                Aggiungi
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
