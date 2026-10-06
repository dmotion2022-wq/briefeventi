import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { hasApiKey } from "@/ai/qwen";
import { latestBrief } from "@/ai/context";
import type { BibleData, ConceptData } from "@/ai/schemas/creative";
import { getDb, schema } from "@/db/client";
import { buildBibleAction, generateConceptsAction } from "@/server/creative";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";

const VARIANT = {
  safe: { label: "Sicura", tone: "violet" },
  bold: { label: "Audace", tone: "magenta" },
  disruptive: { label: "Dirompente", tone: "amber" },
  merged: { label: "Fusa", tone: "neutral" },
  custom: { label: "Personalizzata", tone: "neutral" },
} as const;

type Critique = {
  scores: { criterion: string; score: number; reason: string }[];
  strengths: string[];
  weaknesses: string[];
  fixes: string[];
  comparison?: string;
  recommendation?: string;
  tooSimilar?: boolean;
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

export default async function ConceptsPage(props: PageProps<"/projects/[id]/concepts">) {
  const { id } = await props.params;
  const db = getDb();
  const aiReady = hasApiKey();
  const brief = latestBrief(id);
  if (!brief) return <EmptyState title="Prima il brief">I concept nascono dal brief analizzato (meglio se confermato e con le lacune chiarite).</EmptyState>;

  const concepts = db
    .select()
    .from(schema.concepts)
    .where(and(eq(schema.concepts.projectId, id), ne(schema.concepts.status, "discarded")))
    .orderBy(desc(schema.concepts.createdAt))
    .all()
    .slice(0, 3)
    .sort((a, b) => ["safe", "bold", "disruptive"].indexOf(a.variant) - ["safe", "bold", "disruptive"].indexOf(b.variant));
  const bible = db.select().from(schema.conceptBibles).where(eq(schema.conceptBibles.projectId, id)).orderBy(desc(schema.conceptBibles.version)).get();
  const formatIds = concepts.flatMap((c) => (c.data as unknown as ConceptData).formatIds ?? []);
  const workIds = concepts.flatMap((c) => (c.data as unknown as ConceptData).referenceWorkIds ?? []);
  const formats = new Map(
    (formatIds.length ? db.select().from(schema.formatIdeas).where(inArray(schema.formatIdeas.id, formatIds)).all() : []).map((f) => [f.id, f.name]),
  );
  const works = new Map(
    (workIds.length ? db.select().from(schema.referenceWorks).where(inArray(schema.referenceWorks.id, workIds)).all() : []).map((w) => [w.id, w.concept ?? w.name]),
  );
  const firstCritique = concepts[0]?.critique as Critique | undefined;

  const regenerate = (
    <form action={generateConceptsAction.bind(null, id)} className="flex flex-col gap-2">
      <Textarea
        name="instructions"
        placeholder="Indicazioni facoltative: es. più legato al territorio, niente tecnologia, puntare sulla cena…"
        className="min-h-16"
      />
      <div className="flex justify-end">
        <SubmitButton variant={concepts.length ? "secondary" : "primary"}>
          <Sparkles size={14} /> {concepts.length ? "Rigenera i tre concept" : "Genera tre concept"}
        </SubmitButton>
      </div>
    </form>
  );

  if (!concepts.length) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState title="Tre direzioni creative">
          Sicura, audace e dirompente, costruite sulla libreria dei format e sulle vostre proposte passate, poi valutate da una
          &quot;commissione di gara&quot; sui criteri del bando.
          {brief.status !== "confirmed" && " Consiglio: conferma prima il brief."}
        </EmptyState>
        <div className="mt-4">{aiReady ? regenerate : <p className="text-center text-[13px] text-n500">Serve la chiave Qwen: incollala in Impostazioni.</p>}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {firstCritique?.tooSimilar && (
        <div className="rounded-sm bg-amber-soft px-4 py-2 text-[13px] text-[#6b4700]">
          La commissione segnala due proposte troppo simili: conviene rigenerare con indicazioni più precise.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {concepts.map((c) => {
          const d = c.data as unknown as ConceptData;
          const crit = c.critique as Critique | null;
          const v = VARIANT[c.variant];
          return (
            <Card key={c.id} className={cn("flex flex-col", c.status === "selected" && "ring-2 ring-violet")}>
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <Badge tone={v.tone}>{v.label}</Badge>
                <div className="flex items-center gap-2">
                  {c.status === "selected" && <Badge tone="dark">scelto</Badge>}
                  {c.scoreBp != null && (
                    <span className="font-display text-xl font-bold" title="Media pesata dei voti della commissione">
                      {(c.scoreBp / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                      <span className="text-[12px] font-normal text-n500">/10</span>
                    </span>
                  )}
                </div>
              </div>
              <CardBody className="flex flex-1 flex-col gap-3">
                <div>
                  <div className="text-[18px] font-semibold leading-tight">{d.name}</div>
                  <div className="mt-1 text-[14px] italic text-violet">“{d.claim}”</div>
                </div>
                <p className="text-[13px] leading-relaxed">{d.bigIdea}</p>
                <div className="rounded-sm bg-ink p-3 text-paper">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-amber">Momento wow · {d.wowMoment.when}</div>
                  <div className="mt-1 font-semibold">{d.wowMoment.title}</div>
                  <p className="mt-1 text-[13px] text-n200">{d.wowMoment.description}</p>
                </div>
                <Section label="Insight">{d.insight}</Section>
                <Section label="Momenti chiave">
                  <ul className="list-disc pl-4">
                    {d.experienceHighlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </Section>
                <Section label="Location">{d.venueDirection}</Section>
                <Section label="Look & feel">{d.lookAndFeel}</Section>
                {(d.formatIds.length > 0 || d.referenceWorkIds.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {d.formatIds.map((f) => (
                      <Badge key={f} tone="violet">
                        {formats.get(f) ?? f}
                      </Badge>
                    ))}
                    {d.referenceWorkIds.map((w) => (
                      <Badge key={w} title="Proposta passata di riferimento">
                        ↺ {(works.get(w) ?? w).slice(0, 40)}
                      </Badge>
                    ))}
                  </div>
                )}
                <Section label="Perché vince">{d.whyItWins}</Section>
                <div className="text-[12px] text-n500">
                  Impatto sul budget: {{ low: "contenuto", mid: "medio", high: "alto" }[d.budgetImpact]} · Rischi: {d.risks.join("; ")}
                </div>
                {crit && (
                  <details className="rounded-sm border border-line bg-paper/60 px-3 py-2 text-[12px]">
                    <summary className="cursor-pointer font-medium">Valutazione della commissione</summary>
                    <table className="mt-2 w-full">
                      <tbody>
                        {crit.scores.map((s) => (
                          <tr key={s.criterion} className="border-b border-line last:border-0 align-top">
                            <td className="py-1 pr-2">{s.criterion}</td>
                            <td className="py-1 pr-2 font-semibold tabular">{s.score}</td>
                            <td className="py-1 text-n500">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2">
                      <b>Punti forti:</b> {crit.strengths.join("; ")}
                    </div>
                    <div>
                      <b>Debolezze:</b> {crit.weaknesses.join("; ")}
                    </div>
                    <div>
                      <b>Da sistemare:</b> {crit.fixes.join("; ")}
                    </div>
                  </details>
                )}
                {aiReady && (
                  <form action={buildBibleAction.bind(null, id, c.id)} className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
                    <Textarea name="instructions" placeholder="Correzioni prima di procedere (facoltative)" className="min-h-14" />
                    {concepts
                      .filter((o) => o.id !== c.id)
                      .map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-[12px]">
                          <input type="checkbox" name="merge" value={o.id} /> integra elementi di “{(o.data as unknown as ConceptData).name}”
                        </label>
                      ))}
                    <SubmitButton size="sm">Scegli e crea la concept bible</SubmitButton>
                  </form>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {firstCritique?.recommendation && (
        <Card>
          <CardHeader title="La commissione" />
          <CardBody className="flex flex-col gap-2 text-[13px] leading-relaxed">
            <p>{firstCritique.comparison}</p>
            <p className="font-medium">{firstCritique.recommendation}</p>
          </CardBody>
        </Card>
      )}

      {bible && <BibleView data={bible.data as unknown as BibleData} version={bible.version} />}

      {aiReady && (
        <Card>
          <CardHeader title="Nuova tornata di concept" description="I concept attuali restano in archivio." />
          <CardBody>{regenerate}</CardBody>
        </Card>
      )}
    </div>
  );
}

function BibleView({ data, version }: { data: BibleData; version: number }) {
  return (
    <Card>
      <CardHeader eyebrow={`Concept bible · versione ${version}`} title={data.name} description={`“${data.claim}”`} />
      <CardBody className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Section label="Tono">
            {data.tone}
            <div className="mt-1 flex flex-wrap gap-1">
              {data.toneWords.map((w) => (
                <Badge key={w}>{w}</Badge>
              ))}
            </div>
          </Section>
          <Section label="Arco narrativo">
            <ol className="space-y-1">
              {data.narrativeArc.map((p, i) => (
                <li key={i}>
                  <b>{p.phase}</b> — {p.description}
                </li>
              ))}
            </ol>
          </Section>
          <Section label="Messaggi chiave">
            <ul className="list-disc pl-4">
              {data.keyMessages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Section>
          <Section label="Momento wow">
            <b>{data.wowMoment.title}</b> ({data.wowMoment.when}) — {data.wowMoment.description}
          </Section>
        </div>
        <div className="flex flex-col gap-4">
          <Section label="Palette">
            <div className="flex flex-wrap gap-2">
              {data.palette.map((p) => (
                <div key={p.hex} className="w-24">
                  <div className="h-14 rounded-sm border border-line" style={{ background: p.hex }} />
                  <div className="mt-1 text-[12px] font-medium">{p.name}</div>
                  <div className="font-mono text-[11px] text-n500">
                    {p.hex} · {p.role}
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section label="Tipografia">
            Titoli: <b>{data.typography.display}</b> · Testi: <b>{data.typography.text}</b>
            <div className="text-n500">{data.typography.notes}</div>
          </Section>
          <Section label="Key visual">
            {data.keyVisual.description}
            <div className="mt-1 rounded-xs bg-paper px-2 py-1 font-mono text-[11px] text-n700">{data.keyVisual.imagePrompt}</div>
          </Section>
          <Section label="Declinazioni">{data.applications.join(" · ")}</Section>
          <div className="grid grid-cols-2 gap-3">
            <Section label="Fare">
              <ul className="list-disc pl-4">
                {data.dos.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
            <Section label="Evitare">
              <ul className="list-disc pl-4">
                {data.donts.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
