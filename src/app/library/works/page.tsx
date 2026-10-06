import { listWorks } from "@/db/queries/library";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { DocLink } from "@/components/doc-link";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Proposte passate" };

export default function WorksPage() {
  const works = listWorks();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Archivio"
        title="Proposte passate"
        description="Le proposte della cartella WORKS: i concept le usano come riferimento e le citano solo se esistono davvero."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {works.map((w) => (
          <Card key={w.id}>
            <CardBody className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="eyebrow">{w.eventType ?? "evento"}</div>
                {w.fitScore && (
                  <Badge tone={w.fitScore >= 4 ? "ok" : "neutral"} title={w.fitReason ?? undefined}>
                    fit {w.fitScore}/5
                  </Badge>
                )}
              </div>
              <div className="text-[15px] font-semibold leading-snug">{w.concept ?? w.name}</div>
              <div className="text-[12px] text-n500">
                {[w.area, w.durationText, w.paxText ? `${w.paxText} pax` : null].filter(Boolean).join(" · ")}
              </div>
              {w.engagement && (
                <div className="text-[13px]">
                  <span className="text-n500">Engagement: </span>
                  {w.engagement}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1">
                {(w.tags ?? []).map((t) => (
                  <Badge key={t} tone="violet">
                    {t}
                  </Badge>
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2">
                <span className="truncate font-mono text-[11px] text-n500">{w.name}</span>
                {w.documentId && <DocLink id={w.documentId} name="Apri PDF" />}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
