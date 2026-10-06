import { hasApiKey } from "@/ai/qwen";
import { requireUser } from "@/auth/session";
import { schema } from "@/db/client";
import { createProjectAction } from "@/server/projects";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SECTOR_LABELS } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";
import { UploadField } from "@/components/upload-field";
import { usesBlob } from "@/lib/storage";

export const metadata = { title: "Nuovo progetto" };

export default async function NewProjectPage() {
  await requireUser();
  const aiReady = hasApiKey();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Nuovo progetto"
        title="Parti dal brief del cliente"
        description="Incolla il testo del brief o carica i documenti della gara. L'analisi estrae i dati con la citazione della fonte e segnala cosa manca."
      />
      <form action={createProjectAction} className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Progetto" />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Nome del progetto">
              <Input name="title" required placeholder="Convention vendite 2027" />
            </Field>
            <Field label="Cliente">
              <Input name="clientName" required />
            </Field>
            <Field label="Settore">
              <Select name="sector" defaultValue="corporate">
                {schema.SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo di evento (se già noto)">
              <Input name="eventType" placeholder="convention, congresso, incentive, kick-off…" />
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="isTender" /> È una gara
            </label>
            <Field label="Scadenza della gara">
              <Input name="tenderDeadline" type="date" />
            </Field>
            <Field label="Note interne" className="col-span-2">
              <Textarea name="notes" className="min-h-16" placeholder="Chi ci ha contattato, cosa sappiamo del cliente…" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Brief" description="Puoi usare entrambi: testo incollato e file (PDF, DOCX, email .eml, testo)." />
          <CardBody className="flex flex-col gap-4">
            <Field label="Testo del brief">
              <Textarea name="briefText" className="min-h-48" placeholder="Incolla qui l'email o il documento del cliente…" />
            </Field>
            <Field label="Documenti">
              <UploadField
                online={usesBlob()}
                className="text-[13px] file:mr-3 file:rounded-sm file:border-0 file:bg-ink file:px-3 file:py-2 file:text-paper"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Riservatezza"
            description="Con la modalità riservata, nome del cliente e termini indicati vengono sostituiti da segnaposto prima dell'invio a Qwen e ripristinati nelle risposte."
          />
          <CardBody className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="confidential" /> Modalità riservata
            </label>
            <Field label="Altri termini da nascondere (separati da virgola)" hint="Es. nome del prodotto, marchi, persone">
              <Input name="confidentialTerms" />
            </Field>
          </CardBody>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {!aiReady && (
            <span className="text-[13px] text-n500">
              Manca la chiave Qwen (si incolla in Impostazioni): il progetto si crea, l&apos;analisi parte quando la inserisci.
            </span>
          )}
          <SubmitButton pendingLabel="Creazione e lettura dei documenti…">Crea e analizza</SubmitButton>
        </div>
      </form>
    </div>
  );
}
