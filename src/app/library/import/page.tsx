import { desc, eq, inArray } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { getSetting } from "@/lib/settings";
import { formatDateTime, RUN_STATUS } from "@/lib/labels";
import { startDriveImport, startLibraryExtractAction, startOcrAction } from "@/server/library";
import { hasApiKey } from "@/ai/qwen";
import { RunProgress } from "@/components/run-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/auth/session";

export const metadata = { title: "Import da Drive" };

type Diff = { added: string[]; changed: string[]; unchanged: number };
type Output = {
  mode?: string;
  diff?: { works: Diff; venues: Diff; benchmarks: Diff };
  files?: {
    listed: number;
    downloaded: number;
    reused: number;
    failed: { name: string; error: string }[];
    unindexed: string[];
    ocrNeeded: string[];
    contacts: { phones: number; emails: number };
  };
  contacts?: { phones: number; emails: number; documents: number };
};

const diffLine = (label: string, d?: Diff) =>
  d ? `${label}: ${d.added.length} nuovi, ${d.changed.length} aggiornati, ${d.unchanged} invariati` : null;

export default async function ImportPage() {
  await requireUser();
  const source = await getSetting("drive.source");
  const runs = await getDb()
    .select()
    .from(schema.aiRuns)
    .where(inArray(schema.aiRuns.task, ["library.import", "documents.ocr", "library.extract"]))
    .orderBy(desc(schema.aiRuns.createdAt))
    .limit(8)
    .all();
  const active = runs.find((r) => r.status === "queued" || r.status === "running");
  const ocrPending = (await getDb().select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.extractionStatus, "ocr_needed")).all())
    .length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Archivio"
        title="Import da Google Drive"
        description="Legge il foglio Executive Summary e i PDF delle cartelle WORKS, LOCATIONS / HOTEL e BUDGETS. Ripetibile: aggiorna senza duplicare."
      />

      <Card className="mb-5">
        <CardHeader
          title="Sorgente"
          actions={
            source.folderUrl ? (
              <a href={source.folderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-violet hover:underline">
                Cartella MVP SUPPLIERS <ExternalLink size={12} />
              </a>
            ) : (
              <a href="/settings#drive" className="text-[13px] text-violet hover:underline">
                Imposta la cartella
              </a>
            )
          }
        />
        <CardBody className="flex flex-col gap-4">
          <p className="text-[13px] text-n700">
            La cartella oggi è condivisa con chiunque abbia il link e contiene preventivi con prezzi e contatti: conviene
            restringerla. In quel caso sincronizzala con Google Drive per desktop e indica il percorso nelle Impostazioni.
          </p>
          {active ? (
            <RunProgress runId={active.id} label="Import in corso" />
          ) : (
            <div className="flex flex-wrap gap-2">
              <form action={startDriveImport.bind(null, "dry")}>
                <Button variant="secondary">Prova a vuoto</Button>
              </form>
              <form action={startDriveImport.bind(null, "full")}>
                <Button>Importa indice e PDF</Button>
              </form>
              <form action={startDriveImport.bind(null, "contacts")}>
                <Button variant="ghost">Ricalcola i contatti dai PDF</Button>
              </form>
              {hasApiKey() && (
                <form action={startLibraryExtractAction}>
                  <Button variant="ghost">Leggi sale e prezzi dai PDF (AI)</Button>
                </form>
              )}
              {ocrPending > 0 && hasApiKey() && (
                <form action={startOcrAction}>
                  <Button variant="ghost">Leggi con OCR {ocrPending} PDF fatti di immagini</Button>
                </form>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ultimi import" />
        <div className="divide-y divide-line">
          {runs.length === 0 && (
            <div className="px-5 py-6 text-[13px] text-n500">
              Nessun import dall&apos;interfaccia. L&apos;archivio attuale è stato caricato con <code>npm run import:drive</code>.
            </div>
          )}
          {runs.map((r) => {
            const out = (r.output ?? {}) as Output;
            const status = RUN_STATUS[r.status];
            return (
              <div key={r.id} className="px-5 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="font-medium">
                    {r.task === "documents.ocr"
                      ? "OCR dei PDF"
                      : r.task === "library.extract"
                        ? "Lettura AI di sale e prezzi"
                        : ({ dry: "Prova a vuoto", full: "Import completo", contacts: "Ricalcolo contatti" }[String(r.input?.mode)] ?? "Import")}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-n500">{formatDateTime(r.createdAt)}</span>
                </div>
                {r.error && <div className="mt-1 text-warn">{r.error}</div>}
                <div className="mt-1 text-n700">
                  {[diffLine("Proposte", out.diff?.works), diffLine("Location", out.diff?.venues), diffLine("Listino", out.diff?.benchmarks)]
                    .filter(Boolean)
                    .map((l) => (
                      <div key={l}>{l}</div>
                    ))}
                  {out.files && (
                    <div>
                      PDF: {out.files.listed} trovati, {out.files.downloaded} nuovi, {out.files.reused} già presenti · contatti{" "}
                      {out.files.contacts.phones} tel, {out.files.contacts.emails} email
                    </div>
                  )}
                  {out.contacts && (
                    <div>
                      Contatti ricalcolati da {out.contacts.documents} PDF: {out.contacts.phones} tel, {out.contacts.emails} email
                    </div>
                  )}
                  {out.files?.ocrNeeded.length ? (
                    <div className="text-n500">Da leggere con OCR: {out.files.ocrNeeded.join("; ")}</div>
                  ) : null}
                  {out.files?.unindexed.length ? (
                    <div className="text-n500">Non presenti nell&apos;indice: {out.files.unindexed.join("; ")}</div>
                  ) : null}
                  {out.files?.failed.length ? (
                    <div className="text-warn">Errori: {out.files.failed.map((f) => `${f.name}: ${f.error}`).join("; ")}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
