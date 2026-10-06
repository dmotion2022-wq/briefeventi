import { listFormats } from "@/db/queries/library";
import { createFormat, toggleFormat } from "@/server/library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { COST_LEVEL_LABELS, FORMAT_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/cn";

export const metadata = { title: "Format innovativi" };

export default function FormatsPage() {
  const formats = listFormats();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Archivio"
        title="Format innovativi"
        description="Il gusto dell'agenzia: i concept attingono da qui, insieme alla lista dei cliché da evitare. Segna quelli già provati con un fornitore."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-3 md:grid-cols-2">
          {formats.map((f) => (
            <Card key={f.id} className={cn(!f.active && "opacity-50")}>
              <CardBody className="flex h-full flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="violet">{FORMAT_TYPE_LABELS[f.type]}</Badge>
                  <span className="font-mono text-[12px] text-n500" title="Livello di costo">
                    {COST_LEVEL_LABELS[f.costLevel]}
                    {f.paxMin || f.paxMax ? ` · ${f.paxMin ?? "?"}–${f.paxMax ?? "?"} pax` : ""}
                  </span>
                </div>
                <div className="font-semibold">{f.name}</div>
                <p className="text-[13px] text-n700">{f.description}</p>
                {f.suppliersHint && <p className="text-[12px] text-n500">Fornitori: {f.suppliersHint}</p>}
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <form action={toggleFormat.bind(null, f.id, "triedByUs")}>
                    <Button variant={f.triedByUs ? "dark" : "secondary"} size="sm">
                      {f.triedByUs ? "Già fatto da noi" : "Segna come già fatto"}
                    </Button>
                  </form>
                  <form action={toggleFormat.bind(null, f.id, "active")}>
                    <Button variant="ghost" size="sm">
                      {f.active ? "Disattiva" : "Riattiva"}
                    </Button>
                  </form>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
        <Card className="h-fit">
          <CardHeader title="Nuovo format" />
          <CardBody>
            <form action={createFormat} className="flex flex-col gap-3">
              <Field label="Nome">
                <Input name="name" required />
              </Field>
              <Field label="Descrizione">
                <Textarea name="description" required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo">
                  <Select name="type" defaultValue="format">
                    {Object.entries(FORMAT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Costo">
                  <Select name="costLevel" defaultValue="mid">
                    <option value="low">€ basso</option>
                    <option value="mid">€€ medio</option>
                    <option value="high">€€€ alto</option>
                  </Select>
                </Field>
              </div>
              <Field label="Fornitori di riferimento">
                <Input name="suppliersHint" />
              </Field>
              <Field label="Tag (separati da virgola)">
                <Input name="tags" />
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="triedByUs" /> già fatto da noi
              </label>
              <Button>Aggiungi</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
