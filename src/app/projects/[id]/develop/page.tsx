import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { hasApiKey } from "@/ai/qwen";
import { agendaSlotsOf, latestBible } from "@/ai/context";
import { MODULE_ORDER, type ModuleData, type ModuleKind } from "@/ai/schemas/development";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { developModulesAction } from "@/server/development";
import { generateQuoteFromComponentsAction } from "@/server/quotes";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";

const MODULE_LABELS: Record<ModuleKind, string> = {
  venue: "Location e sale",
  accommodation: "Pernottamento",
  catering: "Catering",
  graphic: "Concept grafico",
  engagement: "Interazione",
  production: "Produzione e servizi",
};


const List = ({ items }: { items: string[] }) =>
  items?.length ? (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  ) : (
    <span className="text-n400">—</span>
  );

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function ModuleBody({ kind, data, slotName, venueName, formatName }: { kind: ModuleKind; data: unknown; slotName: (id: string) => string; venueName: (id: string | null) => string | null; formatName: (id: string | null) => string | null }) {
  switch (kind) {
    case "venue": {
      const d = data as ModuleData["venue"];
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Block label="Sintesi">{d.summary}</Block>
          <Block label="Requisiti">
            Plenaria: {d.requirements?.plenary?.pax} pax ({d.requirements?.plenary?.setup})
            {d.requirements?.breakouts?.map((b, i) => (
              <div key={i}>
                Breakout: {b.count} × {b.pax} pax ({b.setup})
              </div>
            ))}
            <List items={[...(d.requirements?.otherSpaces ?? []), ...(d.requirements?.technical ?? [])]} />
          </Block>
          <Block label="Location candidate">
            {d.candidates?.map((c, i) => (
              <div key={i} className="mb-1.5">
                <b>{c.name}</b> {c.city && `(${c.city})`} {c.venueId && <Badge tone="ok">in archivio</Badge>}
                <div className="text-n500">{c.why}</div>
                {c.watchouts && <div className="text-[12px] text-[#8a5a00]">Attenzione: {c.watchouts}</div>}
              </div>
            ))}
          </Block>
          <Block label="Piano sale">
            {d.roomPlan?.map((r, i) => (
              <div key={i}>
                {r.space} · {r.setup} · {r.pax} pax — {(r.slotIds ?? []).map(slotName).join(", ")}
              </div>
            ))}
          </Block>
          <Block label="Tipologie adatte">{(d.venueTypes ?? []).join(" · ")}</Block>
          <Block label="Accessibilità e logistica">
            {d.requirements?.accessibility} {d.requirements?.logistics}
          </Block>
        </div>
      );
    }
    case "accommodation": {
      const d = data as ModuleData["accommodation"];
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Block label="Sintesi">{d.needed ? d.summary : "Pernottamento non necessario."}</Block>
          <Block label="Notti e camere">
            {d.nights?.map((n, i) => (
              <div key={i}>
                {n.date ?? `Notte ${i + 1}`}: {n.singles} singole/DUS, {n.doubles} doppie
              </div>
            ))}
          </Block>
          <Block label="Categoria e posizione">
            {d.category} · {d.location}
          </Block>
          <Block label="Hotel candidati">
            {d.candidates?.map((c, i) => (
              <div key={i}>
                <b>{c.venueId ? venueName(c.venueId) ?? c.name : c.name}</b> — {c.why}
              </div>
            ))}
          </Block>
          <Block label="Regole di ospitalità">
            <List items={d.rules} />
          </Block>
        </div>
      );
    }
    case "catering": {
      const d = data as ModuleData["catering"];
      return (
        <div className="flex flex-col gap-4">
          <Block label="Il cibo racconta il concept">{d.foodConcept}</Block>
          <table className="w-full text-[13px]">
            <tbody>
              {d.services?.map((s, i) => (
                <tr key={i} className="border-b border-line align-top last:border-0">
                  <td className="w-56 py-2 pr-3 font-medium">{slotName(s.slotId)}</td>
                  <td className="py-2 pr-3">
                    <b>{s.service}</b> · {s.formula} · {s.pax} pax
                    <div className="text-n500">{s.menuIdea}</div>
                    <div className="text-[12px] text-n500">
                      Diete: {s.dietary} · Allestimento: {s.setting}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Block label="Sostenibilità">
            <List items={d.sustainability} />
          </Block>
        </div>
      );
    }
    case "graphic": {
      const d = data as ModuleData["graphic"];
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Block label="Identità">{d.identitySummary}</Block>
          <Block label="Declinazioni">
            {d.applications?.map((a, i) => (
              <div key={i}>
                <b>{a.name}</b> ({a.format}) — {a.description}
              </div>
            ))}
          </Block>
          <Block label="Segnaletica">
            <List items={d.signage} />
          </Block>
          <Block label="Digitale">
            <List items={d.digital} />
          </Block>
          <Block label="Immagini da generare">
            {d.imagePrompts?.map((p, i) => (
              <div key={i} className="mb-1">
                <Badge>{p.purpose}</Badge> <b>{p.title}</b> <span className="font-mono text-[11px] text-n500">{p.size}</span>
              </div>
            ))}
          </Block>
        </div>
      );
    }
    case "engagement": {
      const d = data as ModuleData["engagement"];
      const phase = (label: string, items: ModuleData["engagement"]["before"]) => (
        <Block label={label}>
          {items?.map((m, i) => (
            <div key={i} className="mb-2">
              <b>{m.name}</b> {m.analog ? <Badge>analogico</Badge> : <Badge tone="violet">digitale</Badge>}{" "}
              {m.formatId && <Badge tone="magenta">{formatName(m.formatId)}</Badge>}
              <div>{m.description}</div>
              <div className="text-[12px] text-n500">
                {(m.slotIds ?? []).map(slotName).join(", ")} — {m.why}
              </div>
            </div>
          ))}
        </Block>
      );
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Block label="Sintesi">{d.summary}</Block>
          </div>
          {phase("Prima", d.before)}
          {phase("Durante", d.during)}
          {phase("Dopo", d.after)}
          <div className="md:col-span-3">
            <Block label="Piano di misurazione">
              <table className="w-full">
                <tbody>
                  {d.measurement?.kpis?.map((k, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="py-1 pr-3 font-medium">{k.name}</td>
                      <td className="py-1 pr-3">{k.how}</td>
                      <td className="py-1 text-n500">{k.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          </div>
        </div>
      );
    }
    case "production": {
      const d = data as ModuleData["production"];
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <Block label="Audio, video, luci">
            <List items={d.av} />
          </Block>
          <Block label="Allestimenti">
            <List items={d.staging} />
          </Block>
          <Block label="Staff">
            {d.staff?.map((s, i) => (
              <div key={i}>
                {s.count} × {s.role} ({s.when})
              </div>
            ))}
          </Block>
          <Block label="Trasporti">
            {d.transport?.map((t, i) => (
              <div key={i}>
                {t.what} · {t.pax} pax · {t.when}
              </div>
            ))}
          </Block>
          <Block label="Sicurezza e permessi">
            <List items={[...(d.safety ?? []), ...(d.permits ?? [])]} />
          </Block>
          <Block label="SIAE e sostenibilità">
            {d.siaeNeeded ? `SIAE necessaria: ${d.siaeNotes ?? ""}` : "SIAE non necessaria"}
            <List items={d.sustainability} />
          </Block>
        </div>
      );
    }
  }
}

export default async function DevelopPage(props: PageProps<"/projects/[id]/develop">) {
  await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const db = getDb();
  const aiReady = hasApiKey();
  const [slots, bible, modules] = await Promise.all([
    agendaSlotsOf(id),
    latestBible(id),
    db.select().from(schema.modules).where(eq(schema.modules.projectId, id)).all(),
  ]);
  const tab = (MODULE_ORDER.includes(sp.tab as ModuleKind) ? sp.tab : modules[0]?.kind ?? "venue") as ModuleKind;
  const current = modules.find((m) => m.kind === tab);
  const components = current
    ? await db.select().from(schema.components).where(eq(schema.components.moduleId, current.id)).orderBy(asc(schema.components.position)).all()
    : [];
  const allComponents = await db.select().from(schema.components).where(eq(schema.components.projectId, id)).all();
  const estimate = allComponents.reduce(
    (acc, c) => {
      const e = (c.specs as { estimate?: { minCents: number; maxCents: number } } | null)?.estimate;
      if (e && !c.optional) {
        acc.min += e.minCents;
        acc.max += e.maxCents;
      }
      return acc;
    },
    { min: 0, max: 0 },
  );
  const slotName = (sid: string) => {
    const s = slots.find((x) => x.id === sid);
    return s ? `G${s.day} ${s.startTime} ${s.title}` : "slot non trovato";
  };
  const d = (current?.data ?? {}) as { candidates?: { venueId: string | null }[] };
  const venueIds = (d.candidates ?? []).map((c) => c.venueId).filter((x): x is string => !!x);
  const venues = new Map(
    (venueIds.length ? await db.select().from(schema.venues).where(inArray(schema.venues.id, venueIds)).all() : []).map((v) => [v.id, v.name]),
  );
  const formats = new Map((await db.select().from(schema.formatIdeas).all()).map((f) => [f.id, f.name]));

  if (!slots.length || !bible) {
    return <EmptyState title="Prima concept bible e scaletta">I moduli si agganciano agli slot della scaletta e seguono la concept bible.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-card p-1">
          {MODULE_ORDER.map((k) => {
            const m = modules.find((x) => x.kind === k);
            return (
              <Link
                key={k}
                href={`?tab=${k}`}
                className={cn("rounded-xs px-3 py-1.5 text-[13px]", tab === k ? "bg-ink text-paper" : m ? "text-ink hover:bg-n100" : "text-n400 hover:bg-n100")}
              >
                {MODULE_LABELS[k]}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {allComponents.length > 0 && (
            <span className="text-[12px] text-n500">
              Stima costi: {formatCents(estimate.min, { noCents: true })} – {formatCents(estimate.max, { noCents: true })}
            </span>
          )}
          {aiReady && (
            <form action={developModulesAction.bind(null, id, null)}>
              <SubmitButton variant={modules.length ? "secondary" : "primary"} size="sm">
                {modules.length ? "Rigenera tutti i moduli" : "Sviluppa la proposta"}
              </SubmitButton>
            </form>
          )}
          {allComponents.length > 0 && (
            <form action={generateQuoteFromComponentsAction.bind(null, id)}>
              <SubmitButton size="sm">Genera il preventivo</SubmitButton>
            </form>
          )}
        </div>
      </div>

      {!current ? (
        <EmptyState title={`${MODULE_LABELS[tab]} da sviluppare`}>
          {aiReady ? "Lancia lo sviluppo della proposta: i sei moduli vengono scritti in sequenza con lo stesso contesto." : "Serve la chiave Qwen."}
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader title={MODULE_LABELS[tab]} eyebrow={`costruito sulla bible v${(current.builtFrom as { bible?: number } | null)?.bible ?? "?"}${bible && (current.builtFrom as { bible?: number } | null)?.bible !== bible.version ? " · da riallineare alla bible attuale" : ""}`} />
            <CardBody>
              <ModuleBody kind={tab} data={current.data} slotName={slotName} venueName={(vid) => (vid ? venues.get(vid) ?? null : null)} formatName={(fid) => (fid ? formats.get(fid) ?? null : null)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Voci di costo del modulo" description="Diventano le voci del preventivo, con la stima come forchetta finché un fornitore non conferma." />
            <table className="w-full text-[13px]">
              <tbody>
                {components.map((c) => {
                  const e = (c.specs as { estimate?: { minCents: number; maxCents: number; basis: string } } | null)?.estimate;
                  return (
                    <tr key={c.id} className="border-b border-line align-top last:border-0">
                      <td className="py-2 pr-3 pl-5">
                        <div className="font-medium">
                          {c.title} {c.optional && <Badge tone="amber">opzionale</Badge>}
                        </div>
                        <div className="text-[12px] text-n500">{c.description}</div>
                      </td>
                      <td className="py-2 pr-3 text-[12px] text-n500">{c.category}</td>
                      <td className="py-2 pr-3 tabular">
                        {c.quantityHint} {c.unitHint}
                        {c.periodsHint && c.periodsHint !== 1 ? ` × ${c.periodsHint}` : ""}
                      </td>
                      <td className="py-2 pr-5 text-right tabular">
                        {e ? `${formatCents(e.minCents, { noCents: true })} – ${formatCents(e.maxCents, { noCents: true })}` : "—"}
                        {e?.basis && <div className="text-[11px] text-n500">{e.basis}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          {aiReady && (
            <Card>
              <CardHeader title={`Rigenera "${MODULE_LABELS[tab]}" con indicazioni`} />
              <CardBody>
                <form action={developModulesAction.bind(null, id, [tab])} className="flex flex-col gap-2">
                  <Textarea name="instructions" required placeholder="Es. cena in un luogo diverso dalla plenaria, solo fornitori del territorio, niente buffet…" className="min-h-14" />
                  <div className="flex justify-end">
                    <SubmitButton variant="secondary">Rigenera il modulo</SubmitButton>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
