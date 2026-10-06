import { desc, eq } from "drizzle-orm";
import { Download, FileSpreadsheet, FileText, Globe, Presentation } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { currentQuote } from "@/db/queries/quotes";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/labels";

const KIND = { pptx: "PowerPoint", html: "Pagina web", pdf: "PDF", xlsx: "Excel" } as const;
const VARIANT = { client: "cliente", internal: "interno", technical: "senza prezzi" } as const;

function ExportForm({ action, label, icon, children }: { action: string; label: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
      <span className="text-n500">{icon}</span>
      <span className="min-w-48 font-medium">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-4 text-[13px]">{children}</div>
      <button className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-violet px-3 text-[13px] text-white hover:bg-[#5a3de0]">
        <Download size={14} /> Genera
      </button>
    </form>
  );
}

export default async function ExportsPage(props: PageProps<"/projects/[id]/exports">) {
  const { id } = await props.params;
  const quote = currentQuote(id);
  const history = getDb().select().from(schema.exportsTable).where(eq(schema.exportsTable.projectId, id)).orderBy(desc(schema.exportsTable.createdAt)).limit(30).all();
  const pricesToggle = (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" name="prices" value="1" /> mostra il budget
    </label>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Proposta"
            description="Senza budget è la busta tecnica da gara; con il budget aggiunge la sintesi economica (dalla revisione corrente del preventivo)."
          />
          <ExportForm action={`/api/projects/${id}/pptx`} label="PowerPoint modificabile" icon={<Presentation size={16} />}>
            {pricesToggle}
            <label className="flex items-center gap-1.5" title="Usa Arial al posto dei font del brand, se sul computer che apre il file non sono installati">
              <input type="checkbox" name="safe" value="1" /> font sicuri
            </label>
          </ExportForm>
          <ExportForm action={`/api/projects/${id}/html`} label="Pagina web interattiva" icon={<Globe size={16} />}>
            {pricesToggle}
            <span className="text-n500">un solo file, funziona offline</span>
          </ExportForm>
          <ExportForm action={`/api/projects/${id}/pdf`} label="Proposta in PDF" icon={<FileText size={16} />}>
            {pricesToggle}
          </ExportForm>
          <CardBody className="text-[12px] text-n500">
            Anteprima della pagina web:{" "}
            <a href={`/api/projects/${id}/html?preview=1`} target="_blank" className="text-violet hover:underline">
              apri nel browser
            </a>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Preventivo" description={quote ? `${quote.number}${quote.revision > 1 ? ` rev. ${quote.revision}` : ""}` : "Nessun preventivo ancora"} />
          {quote && (
            <>
              <ExportForm action={`/api/quotes/${quote.id}/pdf`} label="Preventivo in PDF" icon={<FileText size={16} />} />
              <ExportForm action={`/api/quotes/${quote.id}/xlsx`} label="Excel per il cliente" icon={<FileSpreadsheet size={16} />}>
                <input type="hidden" name="variant" value="client" />
              </ExportForm>
              <ExportForm action={`/api/quotes/${quote.id}/xlsx`} label="Excel interno (costi e margini)" icon={<FileSpreadsheet size={16} />}>
                <input type="hidden" name="variant" value="internal" />
              </ExportForm>
            </>
          )}
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Generati finora" />
        <div className="divide-y divide-line">
          {history.length === 0 && <div className="px-5 py-4 text-[13px] text-n500">Nessun export.</div>}
          {history.map((e) => (
            <a key={e.id} href={`/api/exports/${e.id}`} className="flex items-center gap-2 px-5 py-2.5 text-[13px] hover:bg-paper">
              <span className="font-medium">{KIND[e.kind]}</span>
              <Badge>{VARIANT[e.variant]}</Badge>
              <span className="ml-auto font-mono text-[11px] text-n500">{formatDateTime(e.createdAt)}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
