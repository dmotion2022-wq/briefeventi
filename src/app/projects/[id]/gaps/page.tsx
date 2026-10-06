import { asc, eq } from "drizzle-orm";
import { Mail } from "lucide-react";
import { hasApiKey } from "@/ai/qwen";
import { latestBrief } from "@/ai/context";
import { getDb, schema } from "@/db/client";
import { answerGapAction, runTask } from "@/server/projects";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  specified: { label: "Nel brief", tone: "ok" },
  implied: { label: "Dedotto", tone: "violet" },
  missing: { label: "Manca", tone: "warn" },
  not_applicable: { label: "Non serve", tone: "neutral" },
};
const CRIT: Record<string, { label: string; tone: Tone }> = {
  blocking: { label: "Bloccante", tone: "magenta" },
  important: { label: "Importante", tone: "amber" },
  optional: { label: "Facoltativo", tone: "neutral" },
};
const ORDER = { blocking: 0, important: 1, optional: 2 } as const;

export default async function GapsPage(props: PageProps<"/projects/[id]/gaps">) {
  const { id } = await props.params;
  const brief = latestBrief(id);
  const aiReady = hasApiKey();
  if (!brief) {
    return <EmptyState title="Prima analizza il brief">Le lacune si calcolano sul brief strutturato.</EmptyState>;
  }
  const db = getDb();
  const checklist = new Map(db.select().from(schema.checklistItems).all().map((c) => [c.key, c]));
  const gaps = db
    .select()
    .from(schema.gapItems)
    .where(eq(schema.gapItems.briefId, brief.id))
    .orderBy(asc(schema.gapItems.checklistKey))
    .all()
    .sort(
      (a, b) =>
        Number(a.status === "specified") - Number(b.status === "specified") ||
        ORDER[a.criticality] - ORDER[b.criticality] ||
        (checklist.get(a.checklistKey)?.position ?? 0) - (checklist.get(b.checklistKey)?.position ?? 0),
    );
  const open = gaps.filter((g) => (g.status === "missing" || g.status === "implied") && !g.answer && !g.assumptionAccepted);
  const email = brief.analysis?.clientEmail;

  if (!gaps.length) {
    return (
      <EmptyState
        title="Lacune da analizzare"
        action={
          aiReady ? (
            <form action={runTask.bind(null, id, "gap.analyze")}>
              <SubmitButton>Analizza cosa manca</SubmitButton>
            </form>
          ) : null
        }
      >
        Controllo voce per voce della checklist: location, sale, pernottamento, catering, AV, transfer, staff, sicurezza,
        SIAE, sostenibilità, compliance di settore e budget.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-n500">
            {open.length} punti aperti su {gaps.length} · {gaps.filter((g) => g.status === "specified").length} già nel brief
          </div>
          {aiReady && (
            <form action={runTask.bind(null, id, "gap.analyze")}>
              <SubmitButton variant="ghost" size="sm">
                Rianalizza
              </SubmitButton>
            </form>
          )}
        </div>
        {gaps.map((g) => {
          const item = checklist.get(g.checklistKey);
          const resolved = !!g.answer || g.assumptionAccepted;
          return (
            <Card key={g.id} className={resolved || g.status === "specified" ? "opacity-80" : undefined}>
              <CardBody className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{item?.label ?? g.checklistKey}</span>
                  <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                  {g.status !== "specified" && g.status !== "not_applicable" && (
                    <Badge tone={CRIT[g.criticality].tone}>{CRIT[g.criticality].label}</Badge>
                  )}
                  {resolved && <Badge tone="ok">{g.answer ? "Risposto" : "Ipotesi accettata"}</Badge>}
                </div>
                <p className="text-[13px]">{g.summary}</p>
                {g.evidence?.[0] && (
                  <p className="text-[12px] italic text-n500">
                    “{g.evidence[0].quote}”{g.evidence[0].page ? ` (pag. ${g.evidence[0].page})` : ""}
                    {!g.evidence[0].verified && " · da controllare"}
                  </p>
                )}
                {g.assumption && (
                  <p className="text-[13px]">
                    <span className="text-n500">Ipotesi: </span>
                    {g.assumption}
                  </p>
                )}
                {g.question && (
                  <p className="text-[13px]">
                    <span className="text-n500">Domanda al cliente: </span>
                    {g.question}
                  </p>
                )}
                {g.status !== "specified" && g.status !== "not_applicable" && (
                  <form action={answerGapAction.bind(null, id, g.id)} className="mt-1 flex flex-col gap-2">
                    <Textarea name="answer" defaultValue={g.answer ?? ""} placeholder="Risposta del cliente o decisione interna" className="min-h-14" />
                    <div className="flex items-center justify-between">
                      {g.assumption ? (
                        <label className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" name="accept" defaultChecked={g.assumptionAccepted} /> Va bene l&apos;ipotesi
                        </label>
                      ) : (
                        <span />
                      )}
                      <SubmitButton variant="secondary" size="sm">
                        Salva
                      </SubmitButton>
                    </div>
                  </form>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-col gap-5">
        {brief.analysis && (
          <Card>
            <CardHeader title="Prontezza del brief" />
            <CardBody className="text-[13px] leading-relaxed">{brief.analysis.readiness}</CardBody>
          </Card>
        )}
        {email && (
          <Card>
            <CardHeader
              title="Email di domande al cliente"
              actions={
                <>
                  <CopyButton text={`${email.subject}\n\n${email.body}`} />
                  <a
                    href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-violet px-3 text-[13px] text-white"
                  >
                    <Mail size={14} /> Apri
                  </a>
                </>
              }
            />
            <CardBody>
              <div className="mb-2 font-medium">{email.subject}</div>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-n700">{email.body}</div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
