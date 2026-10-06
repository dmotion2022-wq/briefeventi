import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, Mail, Phone, ShieldCheck, Trash } from "lucide-react";
import { getSupplierDetail, documentsByIds } from "@/db/queries/library";
import { schema } from "@/db/client";
import { addContact, deleteContact, setContactStatus, updateSupplier } from "@/server/suppliers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  CONTACT_STATUS,
  PRICING_MODEL_LABELS,
  SUPPLIER_KIND_LABELS,
  VERIFICATION_METHOD,
  formatDate,
} from "@/lib/labels";
import { formatCents } from "@/lib/money";

export default async function SupplierPage(props: PageProps<"/library/suppliers/[id]">) {
  const { id } = await props.params;
  const detail = getSupplierDetail(id);
  if (!detail) notFound();
  const { supplier: s, contacts, venues, benchmarks, links } = detail;
  const docs = documentsByIds([
    ...contacts.map((c) => c.evidence?.documentId ?? null),
    ...venues.map((v) => v.documentId),
    ...benchmarks.map((b) => b.documentId),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <Link href="/library/suppliers" className="hover:text-violet">
            ← Fornitori
          </Link>
        }
        title={s.name}
        description={[SUPPLIER_KIND_LABELS[s.kind], s.city, s.region].filter(Boolean).join(" · ")}
        actions={
          s.website && (
            <a href={s.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-violet hover:underline">
              {s.domain ?? s.website} <ExternalLink size={13} />
            </a>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Contatti"
            description="Verificato = il contatto compare nella fonte indicata o è stato confermato a voce. Niente numeri inventati."
          />
          <div className="divide-y divide-line">
            {contacts.length === 0 && <div className="px-5 py-6 text-[13px] text-n500">Nessun contatto ancora.</div>}
            {contacts.map((c) => {
              const status = CONTACT_STATUS[c.status];
              const doc = c.evidence?.documentId ? docs.get(c.evidence.documentId) : undefined;
              const isPhone = c.type !== "email" && c.type !== "website";
              return (
                <div key={c.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 text-n500">{isPhone ? <Phone size={15} /> : <Mail size={15} />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={isPhone ? `tel:${c.value}` : `mailto:${c.value}`}
                        className="font-medium text-violet hover:underline"
                      >
                        {c.display}
                      </a>
                      {c.type === "mobile" && <Badge>cellulare</Badge>}
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {c.person && <span className="text-[13px]">{c.person}</span>}
                      {c.role && <span className="text-[12px] text-n500">{c.role}</span>}
                    </div>
                    <div className="mt-1 text-[12px] text-n500">
                      {c.verificationMethod && VERIFICATION_METHOD[c.verificationMethod]}
                      {doc && (
                        <>
                          {" · "}
                          <a
                            href={`/api/documents/${doc.id}${c.evidence?.page ? `#page=${c.evidence.page}` : ""}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 hover:text-violet"
                          >
                            <FileText size={12} /> {doc.filename}
                            {c.evidence?.page ? `, pag. ${c.evidence.page}` : ""}
                          </a>
                        </>
                      )}
                      {c.evidence?.url && (
                        <>
                          {" · "}
                          <a href={c.evidence.url} target="_blank" rel="noreferrer" className="hover:text-violet">
                            {new URL(c.evidence.url).hostname}
                          </a>
                        </>
                      )}
                      {c.verifiedAt && ` · ${formatDate(c.verifiedAt)}`}
                    </div>
                    {c.evidence?.snippet && (
                      <div className="mt-1 rounded-xs bg-paper px-2 py-1 font-mono text-[11px] text-n700">{c.evidence.snippet}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.status !== "verified" || c.verificationMethod !== "manual_call" ? (
                      <form action={setContactStatus.bind(null, c.id, "verified")}>
                        <Button variant="ghost" size="sm" title="Confermato al telefono">
                          <ShieldCheck size={14} />
                        </Button>
                      </form>
                    ) : null}
                    {c.status !== "invalid" && (
                      <form action={setContactStatus.bind(null, c.id, "invalid")}>
                        <Button variant="ghost" size="sm" title="Segna come non valido">
                          ✕
                        </Button>
                      </form>
                    )}
                    <form action={deleteContact.bind(null, c.id)}>
                      <Button variant="ghost" size="sm" title="Elimina">
                        <Trash size={14} />
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
          <CardBody className="border-t border-line bg-paper/50">
            <form action={addContact.bind(null, s.id)} className="flex flex-wrap items-end gap-2">
              <Field label="Telefono o email" className="w-52">
                <Input name="value" required placeholder="+39 02 1234 5678" />
              </Field>
              <Field label="Referente" className="w-40">
                <Input name="person" />
              </Field>
              <Field label="Ruolo" className="w-36">
                <Input name="role" placeholder="Ufficio eventi" />
              </Field>
              <label className="mb-2.5 flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" name="verified" /> confermato a voce
              </label>
              <Button variant="secondary">Aggiungi</Button>
            </form>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Scheda" />
            <CardBody>
              <form action={updateSupplier.bind(null, s.id)} className="grid grid-cols-2 gap-3">
                <Field label="Nome" className="col-span-2">
                  <Input name="name" defaultValue={s.name} required />
                </Field>
                <Field label="Categoria">
                  <Select name="kind" defaultValue={s.kind}>
                    {schema.SUPPLIER_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {SUPPLIER_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Valutazione (1-5)">
                  <Input name="rating" type="number" min={1} max={5} defaultValue={s.rating ?? ""} />
                </Field>
                <Field label="Città">
                  <Input name="city" defaultValue={s.city ?? ""} />
                </Field>
                <Field label="Regione">
                  <Input name="region" defaultValue={s.region ?? ""} />
                </Field>
                <Field label="Sito" className="col-span-2">
                  <Input name="website" defaultValue={s.website ?? ""} />
                </Field>
                <Field label="Note" className="col-span-2">
                  <Textarea name="notes" defaultValue={s.notes ?? ""} />
                </Field>
                <div className="col-span-2 flex justify-end">
                  <Button variant="secondary">Salva</Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {(venues.length > 0 || benchmarks.length > 0 || links.length > 0) && (
            <Card>
              <CardHeader title="Nell'archivio" />
              <CardBody className="flex flex-col gap-3 text-[13px]">
                {venues.map((v) => {
                  const doc = v.documentId ? docs.get(v.documentId) : undefined;
                  return (
                    <div key={v.id}>
                      <div className="font-medium">Scheda location</div>
                      <div className="text-n500">
                        {[v.locationType, v.capacityMax ? `fino a ${v.capacityMax} pax` : null, v.rooms ? `${v.rooms} camere` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {doc && (
                        <a href={`/api/documents/${doc.id}`} target="_blank" className="inline-flex items-center gap-1 text-violet hover:underline">
                          <FileText size={12} /> {doc.filename}
                        </a>
                      )}
                    </div>
                  );
                })}
                {benchmarks.map((b) => (
                  <div key={b.id}>
                    <div className="font-medium">
                      Preventivo {b.category} · {b.observedAt ?? "data n.d."}
                    </div>
                    <div className="text-n500">
                      {PRICING_MODEL_LABELS[b.pricingModel]} · totale {formatCents(b.totalCents)}
                      {b.paxRef ? ` · ${b.paxRef} pax` : ""}
                    </div>
                  </div>
                ))}
                {links.map(({ link, project }) => (
                  <Link key={link.id} href={`/projects/${project.id}/suppliers`} className="hover:text-violet">
                    {project.title} · {link.status}
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
