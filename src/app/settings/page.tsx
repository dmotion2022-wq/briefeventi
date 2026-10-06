import Link from "next/link";
import { asc } from "drizzle-orm";
import { apiKeyStatus } from "@/ai/qwen";
import { authEnabled, requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { getSetting } from "@/lib/settings";
import { MODEL_TIERS } from "@/lib/settings-defaults";
import { saveAgencyAction, saveListsAction, saveModelsAction, saveQuoteDefaultsAction, saveVatRegimeAction } from "@/server/settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { ApiKeyForm } from "@/components/settings/api-key-form";
import { DriveSourceForm } from "@/components/settings/drive-source-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/submit-button";
import { SECTOR_LABELS } from "@/lib/labels";

export const metadata = { title: "Impostazioni" };

const TIER_LABELS: Record<string, string> = {
  max: "Analisi e creatività (brief, lacune, concept, scaletta, moduli)",
  flash: "Lavori semplici (estrazione dai PDF, strutturazione, email ai fornitori)",
  search: "Ricerca fornitori sul web (con fonti)",
  ocr: "OCR delle pagine senza testo",
  image_pro: "Key visual",
  image: "Varianti di immagine e moodboard",
};

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") {
    return <EmptyState title="Solo per amministratori">Le impostazioni (modelli, prezzi, agenzia, IVA, Drive) le modifica chi amministra Event Studio.</EmptyState>;
  }
  const online = !!process.env.VERCEL;
  const key = apiKeyStatus();
  const [agency, models, prices, thinking, fx, quote, cliches, sectors, drive, regimes] = await Promise.all([
    getSetting("agency"),
    getSetting("ai.models"),
    getSetting("ai.prices"),
    getSetting("ai.thinking"),
    getSetting("ai.usdToEur"),
    getSetting("quote.defaults"),
    getSetting("creative.cliches"),
    getSetting("compliance.sectors"),
    getSetting("drive.source"),
    getDb().select().from(schema.vatRegimes).orderBy(asc(schema.vatRegimes.position)).all(),
  ]);
  const modelIds = [...new Set(Object.values(models))];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Sistema" title="Impostazioni" />
      <div className="flex flex-col gap-5">
        {authEnabled() && (
          <Card>
            <CardHeader
              title="Utenti e accessi"
              description="Chi può entrare in Event Studio online: crei tu gli accessi e decidi chi è amministratore."
              actions={
                <Link href="/settings/users" className="text-[13px] text-violet hover:underline">
                  Gestisci gli utenti →
                </Link>
              }
            />
          </Card>
        )}

        <Card>
          <CardHeader
            title="Chiave Qwen (Alibaba Model Studio)"
            description="Serve a tutte le funzioni AI: analisi del brief, concept, moduli, ricerca fornitori, OCR e immagini. Usa una chiave della regione internazionale (Singapore)."
            actions={key.present ? <Badge tone="ok">chiave presente · {key.masked}</Badge> : <Badge tone="warn">chiave mancante</Badge>}
          />
          <CardBody>
            <ApiKeyForm present={key.present} masked={key.masked} editable={!online} />
            {online ? (
              <p className="mt-3 text-xs text-n500">
                Online la chiave non si incolla qui: si imposta nel progetto su Vercel (Settings → Environment Variables → DASHSCOPE_API_KEY),
                così non passa mai dal codice pubblico.
              </p>
            ) : (
              key.source === "env" && (
                <p className="mt-3 text-xs text-n500">
                  La chiave in uso arriva da una variabile d&apos;ambiente del Terminale: quella che salvi qui ha la precedenza.
                </p>
              )
            )}
          </CardBody>
        </Card>

        <Card id="drive">
          <CardHeader
            title="Archivio Drive"
            description="La cartella con proposte passate, location e preventivi dei fornitori da cui l'Archivio importa. Il link non è nel codice: si imposta qui."
            actions={drive.sheetId ? <Badge tone="ok">collegata</Badge> : <Badge tone="warn">da collegare</Badge>}
          />
          <CardBody>
            <DriveSourceForm folderUrl={drive.folderUrl} localPath={drive.localPath} showLocalPath={!online} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Modelli e prezzi"
            description="Il modello per ogni tipo di lavoro e i prezzi per il contatore dei costi. I nomi esatti si controllano con “Verifica” nel riquadro della chiave."
          />
          <CardBody>
            <form action={saveModelsAction} className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                {MODEL_TIERS.map((t) => (
                  <Field key={t} label={TIER_LABELS[t]}>
                    <Input name={`model_${t}`} defaultValue={models[t]} className="font-mono text-[13px]" />
                  </Field>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="thinking_max" defaultChecked={!!thinking.max} /> Ragionamento esteso (thinking) per
                analisi e creatività: più lento, a volte migliore
              </label>
              <div>
                <div className="eyebrow mb-2">Prezzi in USD (da listino Alibaba Cloud, regione internazionale)</div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-n500">
                      <th className="py-1 font-normal">Modello</th>
                      <th className="py-1 font-normal">Input / M token</th>
                      <th className="py-1 font-normal">Output / M token</th>
                      <th className="py-1 font-normal">Input in cache / M</th>
                      <th className="py-1 font-normal">Ogni 1.000 ricerche</th>
                      <th className="py-1 font-normal">A immagine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelIds.map((id) => (
                      <tr key={id}>
                        <td className="py-1 pr-2 font-mono text-[12px]">{id}</td>
                        {(["in", "out", "cached", "calls", "image"] as const).map((k) => {
                          const p = prices[id] ?? {};
                          const v = { in: p.inputPerMTok, out: p.outputPerMTok, cached: p.cachedInputPerMTok, calls: p.perThousandCalls, image: p.perImage }[k];
                          return (
                            <td key={k} className="py-1 pr-2">
                              <Input name={`price_${id}_${k}`} defaultValue={v ?? ""} inputMode="decimal" className="h-8" />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-end justify-between">
                <Field label="Cambio USD → EUR" className="w-40">
                  <Input name="usdToEur" defaultValue={fx} inputMode="decimal" />
                </Field>
                <SubmitButton variant="secondary">Salva</SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Agenzia" description="Intestazione di preventivi e presentazioni." />
          <CardBody>
            <form action={saveAgencyAction} className="grid grid-cols-2 gap-3">
              <Field label="Ragione sociale / nome">
                <Input name="name" defaultValue={agency.name} />
              </Field>
              <Field label="Marchio">
                <Input name="brand" defaultValue={agency.brand} />
              </Field>
              <Field label="Referente">
                <Input name="contactName" defaultValue={agency.contactName} />
              </Field>
              <Field label="Email">
                <Input name="email" defaultValue={agency.email} />
              </Field>
              <Field label="Telefono">
                <Input name="phone" defaultValue={agency.phone} />
              </Field>
              <Field label="Sito">
                <Input name="website" defaultValue={agency.website} />
              </Field>
              <Field label="Indirizzo">
                <Input name="address" defaultValue={agency.address} />
              </Field>
              <Field label="Partita IVA">
                <Input name="vatNumber" defaultValue={agency.vatNumber} />
              </Field>
              <div className="col-span-2 flex justify-end">
                <SubmitButton variant="secondary">Salva</SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Regimi IVA"
            description="Aliquote e note in fattura usate dal preventivo. Da validare con il commercialista: in particolare 74-ter e art. 15."
          />
          <div className="divide-y divide-line">
            {regimes.map((r) => (
              <form key={r.code} action={saveVatRegimeAction.bind(null, r.code)} className="grid grid-cols-[90px_1fr_90px_2fr_auto] items-end gap-2 px-5 py-2.5">
                <div className="pb-2 font-mono text-[12px] text-n500">{r.code}</div>
                <Field label="Nome">
                  <Input name="label" defaultValue={r.label} className="h-8" />
                </Field>
                <Field label="Aliquota %">
                  <Input name="rate" defaultValue={r.rateBp / 100} className="h-8" inputMode="decimal" />
                </Field>
                <Field label="Nota in fattura">
                  <Input name="note" defaultValue={r.invoiceNote ?? ""} className="h-8" />
                </Field>
                <SubmitButton variant="ghost" size="sm">
                  Salva
                </SubmitButton>
              </form>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Preventivo: valori di partenza" />
          <CardBody>
            <form action={saveQuoteDefaultsAction} className="grid grid-cols-3 gap-3">
              <Field label="Validità (giorni)">
                <Input name="validityDays" defaultValue={quote.validityDays} />
              </Field>
              <Field label="Fee d'agenzia %">
                <Input name="agencyFee" defaultValue={quote.agencyFeeBp / 100} />
              </Field>
              <Field label="Imprevisti %">
                <Input name="contingency" defaultValue={quote.contingencyBp / 100} />
              </Field>
              <Field label="Note standard (una per riga)" className="col-span-3">
                <Textarea name="notes" defaultValue={quote.notes.join("\n")} />
              </Field>
              <div className="col-span-3 flex justify-end">
                <SubmitButton variant="secondary">Salva</SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Creatività e compliance" />
          <CardBody>
            <form action={saveListsAction} className="flex flex-col gap-4">
              <Field label="Cliché da evitare (uno per riga): i concept li ricevono come vincolo">
                <Textarea name="cliches" defaultValue={cliches.join("\n")} className="min-h-40" />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(sectors).map(([k, rules]) => (
                  <Field key={k} label={`Regole di settore: ${SECTOR_LABELS[k] ?? k}`}>
                    <Textarea name={`sector_${k}`} defaultValue={rules.join("\n")} />
                  </Field>
                ))}
              </div>
              <div className="flex justify-end">
                <SubmitButton variant="secondary">Salva</SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
