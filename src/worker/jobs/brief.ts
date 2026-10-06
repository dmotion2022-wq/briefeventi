import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { generateObject } from "@/ai/generate";
import { briefContext, documentsText, latestBrief, maskFor, projectDocuments, projectHeader } from "@/ai/context";
import { BriefSchema, gapAnalysisSchema, type BriefData } from "@/ai/schemas/brief";
import { getDb, schema } from "@/db/client";
import { verifyQuote } from "@/domain/evidence";
import { newId } from "@/lib/ids";
import { getSetting } from "@/lib/settings";
import { eurosToCents } from "@/lib/money";
import type { JobHandler } from "../context";
import { throwIfCancelled } from "../context";

const ROLE =
  "Sei un project manager senior di Factory Studios / YEG!, agenzia italiana di eventi corporate (pharma, finance, automotive). Scrivi in italiano.";

async function loadProject(projectId: string | null) {
  if (!projectId) throw new Error("Progetto mancante");
  const project = await getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw new Error("Progetto non trovato");
  return project;
}

/** Estrae il brief strutturato, con citazioni controllate sul testo dei documenti. */
export const briefExtract: JobHandler = async (ctx) => {
  const project = await loadProject(ctx.projectId);
  const db = getDb();
  ctx.progress(5, "Lettura dei documenti");
  const docs = await documentsText(project.id);
  if (!docs.text) throw new Error("Nessun testo nei documenti del progetto: incolla il brief o carica un PDF/DOCX");

  ctx.progress(15, "Analisi del brief con Qwen");
  const brief = await generateObject(
    { task: "brief.extract", runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) },
    {
      tier: "max",
      schema: BriefSchema,
      schemaName: "brief",
      temperature: 0.1,
      system: `${ROLE}
Leggi il brief del cliente ed estrai i dati in modo fedele.
Regole:
- Non inventare: se un dato non è scritto usa null o una lista vuota. Le deduzioni non vanno nei campi, al massimo nella sintesi.
- Per ogni dato chiave che trovi aggiungi una voce in "evidence" con la citazione testuale ESATTA (copiata parola per parola, al massimo 200 caratteri) e il numero di pagina preso dal marcatore [PAGINA n].
- Date in formato AAAA-MM-GG; importi in euro come numeri (senza simboli).
- Se è una gara, riporta i criteri di valutazione con i pesi o punteggi indicati.`,
      prompt: `${projectHeader(project)}\n${docs.truncated ? "(Attenzione: i documenti sono stati accorciati per lunghezza.)\n" : ""}\nDOCUMENTI:\n${docs.text}`,
    },
  );
  throwIfCancelled(ctx.signal);

  ctx.progress(80, "Controllo delle citazioni");
  const pages = (await projectDocuments(project.id)).flatMap((d) => d.pages);
  const evidence = brief.evidence.map((e) => {
    const check = verifyQuote(e.quote, pages, e.page);
    return { ...e, page: check.page ?? e.page, verified: check.verified };
  });
  const verified = evidence.filter((e) => e.verified).length;

  const previous = await latestBrief(project.id);
  const briefId = newId("brf");
  const data: BriefData & { evidence: typeof evidence } = { ...brief, evidence };
  await db
    .insert(schema.briefs)
    .values({ id: briefId, projectId: project.id, version: (previous?.version ?? 0) + 1, status: "draft", data, runId: ctx.runId })
    .run();

  // completa i campi del progetto ancora vuoti (non sovrascrive ciò che hai scritto tu)
  const patch: Partial<typeof schema.projects.$inferInsert> = { status: project.status === "brief" ? "analisi" : project.status };
  if (!project.eventType && brief.eventType) patch.eventType = brief.eventType;
  if (!project.city && brief.location.city) patch.city = brief.location.city;
  if (!project.region && brief.location.region) patch.region = brief.location.region;
  if (!project.startDate && brief.dates.start) patch.startDate = brief.dates.start;
  if (!project.endDate && brief.dates.end) patch.endDate = brief.dates.end;
  if (!project.paxTarget && (brief.audience.paxTarget ?? brief.audience.paxMax)) {
    patch.paxTarget = brief.audience.paxTarget ?? brief.audience.paxMax;
    patch.paxMin = brief.audience.paxMin;
    patch.paxMax = brief.audience.paxMax;
  }
  if (!project.budgetCents && brief.budget.totalEuro) patch.budgetCents = eurosToCents(brief.budget.totalEuro);
  if (project.sector === "corporate" && brief.client.sector !== "corporate") patch.sector = brief.client.sector;
  if (!project.isTender && brief.tender.isTender) {
    patch.isTender = true;
    patch.tenderDeadline = brief.tender.deadline;
  }
  await db.update(schema.projects).set(patch).where(eq(schema.projects.id, project.id)).run();

  return { briefId, citations: evidence.length, verified };
};

/** Lacune sulla checklist master: una voce per ogni componente, con domande al cliente. */
export const gapAnalyze: JobHandler = async (ctx) => {
  const project = await loadProject(ctx.projectId);
  const db = getDb();
  const brief = await latestBrief(project.id);
  if (!brief) throw new Error("Prima serve l'analisi del brief");

  const checklist = await db
    .select()
    .from(schema.checklistItems)
    .where(
      and(
        eq(schema.checklistItems.active, true),
        or(isNull(schema.checklistItems.sectors), sql`exists (select 1 from json_each(${schema.checklistItems.sectors}) where value = ${project.sector})`),
      ),
    )
    .orderBy(asc(schema.checklistItems.position))
    .all();
  const rules = (await getSetting("compliance.sectors"))[project.sector] ?? [];
  const docs = await documentsText(project.id);
  const context = await briefContext(project.id);

  ctx.progress(15, `Verifica di ${checklist.length} voci della checklist`);
  const result = await generateObject(
    { task: "gap.analyze", runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) },
    {
      tier: "max",
      schema: gapAnalysisSchema(checklist.map((c) => c.key)),
      schemaName: "gap_analysis",
      temperature: 0.2,
      system: `${ROLE}
Devi capire cosa manca nel brief per progettare e quotare l'evento. Per ogni voce della checklist indica:
- status: specified (scritto nel brief), implied (non scritto ma deducibile: scrivi l'ipotesi), missing (manca), not_applicable;
- criticality: blocking se senza quell'informazione il preventivo non è affidabile;
- la domanda precisa da fare al cliente quando serve, e l'ipotesi di lavoro se non risponde.
Le citazioni (evidenceQuote) devono essere copiate parola per parola dal brief, con la pagina del marcatore [PAGINA n].
Scrivi infine un'email al cliente, cordiale e professionale, con le domande raggruppate per tema (prima le bloccanti).`,
      prompt: [
        projectHeader(project),
        `\nCHECKLIST:\n${checklist.map((c) => `- ${c.key}: ${c.label}. ${c.description}`).join("\n")}`,
        rules.length ? `\nREGOLE DEL SETTORE ${project.sector.toUpperCase()} (da verificare col cliente):\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
        context ? `\n${context.text}` : "",
        `\nDOCUMENTI:\n${docs.text}`,
      ].join("\n"),
    },
  );
  throwIfCancelled(ctx.signal);

  ctx.progress(85, "Salvataggio");
  const pages = (await projectDocuments(project.id)).flatMap((d) => d.pages);
  await db.transaction(async (tx) => {
    await tx.delete(schema.gapItems).where(eq(schema.gapItems.briefId, brief.id)).run();
    for (const item of checklist) {
      const g = (result.items as Record<string, (typeof result.items)[keyof typeof result.items]>)[item.key];
      if (!g) continue;
      const check = verifyQuote(g.evidenceQuote, pages, g.evidencePage);
      await tx
        .insert(schema.gapItems)
        .values({
          id: newId("gap"),
          projectId: project.id,
          briefId: brief.id,
          checklistKey: item.key,
          status: g.status,
          criticality: g.criticality,
          summary: g.summary,
          evidence: g.evidenceQuote ? [{ quote: g.evidenceQuote, page: check.page ?? g.evidencePage ?? undefined, verified: check.verified }] : [],
          assumption: g.assumption,
          question: g.question,
        })
        .run();
    }
    await tx
      .update(schema.briefs)
      .set({ analysis: { readiness: result.readiness, clientEmail: result.clientEmail, analyzedAt: new Date().toISOString() } })
      .where(eq(schema.briefs.id, brief.id))
      .run();
  });
  const counts = Object.values(result.items as Record<string, { status: string }>).reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = (acc[g.status] ?? 0) + 1;
    return acc;
  }, {});
  return { briefId: brief.id, counts };
};
