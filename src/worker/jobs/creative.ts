import { and, desc, eq, inArray } from "drizzle-orm";
import { generateObject } from "@/ai/generate";
import { briefContext, maskFor, projectHeader } from "@/ai/context";
import type { BriefData } from "@/ai/schemas/brief";
import {
  BibleSchema,
  DEFAULT_RUBRIC,
  conceptsResponseSchema,
  critiqueSchema,
  type ConceptData,
} from "@/ai/schemas/creative";
import { getDb, schema } from "@/db/client";
import { rubricFrom, seededShuffle, weightedScoreBp } from "@/domain/creative/score";
import { newId } from "@/lib/ids";
import { getSetting } from "@/lib/settings";
import type { JobHandler } from "../context";
import { continueLater, LONG_STEP_MS, throwIfCancelled } from "../context";

const CREATIVE_ROLE = `Sei il direttore creativo di Factory Studios / YEG!, agenzia italiana di eventi corporate.
Il tuo lavoro è vincere gare con proposte che fanno dire al cliente "voglio questa".
Principi:
- L'innovazione non è per forza tecnologia: è fare qualcosa di diverso dal solito (formato, spazio, sensi, cibo, racconto, impatto sociale).
- Ogni scelta nasce dagli obiettivi e dal pubblico del brief, non dal gusto personale.
- Il momento wow è concreto, realizzabile, ancorato a un momento preciso dell'evento.
- Rispetti budget, vincoli e regole del settore del cliente.
Scrivi in italiano, con frasi chiare e concrete.`;

async function loadProject(projectId: string | null) {
  if (!projectId) throw new Error("Progetto mancante");
  const project = await getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw new Error("Progetto non trovato");
  return project;
}

async function archiveContext() {
  const db = getDb();
  const formats = await db.select().from(schema.formatIdeas).where(eq(schema.formatIdeas.active, true)).all();
  const works = await db.select().from(schema.referenceWorks).all();
  return {
    formats,
    works,
    text: [
      "LIBRERIA DEI FORMAT (usa gli ID tra parentesi quadre):",
      ...formats.map(
        (f) => `[${f.id}] ${f.name} (${f.type}, costo ${f.costLevel}${f.triedByUs ? ", già fatto da noi" : ""}): ${f.description}`,
      ),
      "",
      "PROPOSTE PASSATE DELL'AGENZIA (usa gli ID tra parentesi quadre):",
      ...works.map(
        (w) =>
          `[${w.id}] ${w.eventType ?? "evento"} · ${w.paxText ?? "pax n.d."} · ${w.area ?? ""} — "${w.concept ?? w.name}" · engagement: ${w.engagement ?? "n.d."} · tag: ${(w.tags ?? []).join(", ")}`,
      ),
    ].join("\n"),
  };
}

const VARIANT_BRIEF = {
  safe: "SICURA: elegante, affidabile, impeccabile nell'esecuzione; innovativa nei dettagli più che nella struttura.",
  bold: "AUDACE: sorprende con un'idea forte ma realistica, che cambia l'esperienza dei partecipanti.",
  disruptive: "DIROMPENTE: rompe le convenzioni del formato; è la proposta che fa discutere la commissione.",
} as const;

type Variant = "safe" | "bold" | "disruptive";

/** Tre concept distinti + valutazione anonima della "commissione di gara". */
export const conceptGenerate: JobHandler = async (ctx) => {
  const project = await loadProject(ctx.projectId);
  const db = getDb();
  const brief = await briefContext(project.id);
  if (!brief) throw new Error("Serve prima l'analisi del brief");
  const call = { runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) };
  const variants = ["safe", "bold", "disruptive"] as const;

  // In cloud la valutazione può partire in una seconda esecuzione: i concept sono già salvati.
  let ids = ctx.input.critiqueOf as Record<Variant, string> | undefined;
  let concepts: Record<Variant, ConceptData>;
  if (ids) {
    const saved = await db.select().from(schema.concepts).where(inArray(schema.concepts.id, Object.values(ids))).all();
    concepts = Object.fromEntries(
      variants.map((v) => [v, saved.find((c) => c.id === ids![v])?.data as unknown as ConceptData]),
    ) as Record<Variant, ConceptData>;
    if (variants.some((v) => !concepts[v])) throw new Error("Concept da valutare non trovati");
  } else {
    const generated = await generateConcepts(ctx, project, brief.text, call);
    concepts = generated;
    // i concept proposti in precedenza restano in archivio come scartati
    await db
      .update(schema.concepts)
      .set({ status: "discarded" })
      .where(and(eq(schema.concepts.projectId, project.id), eq(schema.concepts.status, "proposed")))
      .run();
    ids = Object.fromEntries(variants.map((v) => [v, newId("cnc")])) as Record<Variant, string>;
    const newIds = ids;
    await db
      .insert(schema.concepts)
      .values(variants.map((v) => ({ id: newIds[v], projectId: project.id, variant: v, data: generated[v] as unknown as Record<string, unknown>, runId: ctx.runId })))
      .run();
    if (ctx.timeLeft() < LONG_STEP_MS) {
      return continueLater({ ...ctx.input, critiqueOf: ids }, "Concept pronti: valutazione della commissione…");
    }
  }
  const conceptIds = ids;

  ctx.progress(60, "Valutazione della commissione di gara");
  const tender = (brief.brief.data as Partial<BriefData>).tender;
  const rubric = rubricFrom(tender?.evaluationCriteria, DEFAULT_RUBRIC);
  const order = seededShuffle([...variants], ctx.runId);
  const letters = ["A", "B", "C"] as const;
  const anon = order.map((v, i) => `PROPOSTA ${letters[i]}:\n${JSON.stringify(stripIds(concepts[v]), null, 1)}`).join("\n\n");

  const critique = await generateObject(
    { ...call, task: "concept.critique" },
    {
      tier: "max",
      schema: critiqueSchema(rubric.map((r) => r.criterion)),
      schemaName: "critique",
      temperature: 0.2,
      system: `Sei la commissione di valutazione della gara: un responsabile eventi del cliente, un procurement manager e un esperto di comunicazione.
Valuti tre proposte anonime con severità e senza favoritismi, criterio per criterio, voto da 1 a 10 con motivazione.
Segnala debolezze concrete e come correggerle. Dichiara se due proposte sono troppo simili.`,
      prompt: [
        projectHeader(project),
        `\n${brief.text}`,
        `\nCRITERI DI VALUTAZIONE (con peso):\n${rubric.map((r) => `- ${r.criterion} (${r.weight})`).join("\n")}`,
        `\n${anon}`,
      ].join("\n"),
    },
  );

  for (const [i, v] of order.entries()) {
    const evaluation = critique[letters[i]];
    await db
      .update(schema.concepts)
      .set({
        critique: {
          ...evaluation,
          rubric,
          comparison: critique.comparison,
          recommendation: critique.recommendation,
          tooSimilar: critique.tooSimilar,
        },
        scoreBp: weightedScoreBp(evaluation.scores, rubric),
      })
      .where(eq(schema.concepts.id, conceptIds[v]))
      .run();
  }
  if (project.status === "brief" || project.status === "analisi") {
    await db.update(schema.projects).set({ status: "concept" }).where(eq(schema.projects.id, project.id)).run();
  }
  return { conceptIds, tooSimilar: critique.tooSimilar };
};

async function generateConcepts(
  ctx: Parameters<JobHandler>[0],
  project: Awaited<ReturnType<typeof loadProject>>,
  briefText: string,
  call: { runId: string; projectId: string; signal: AbortSignal; mask: ReturnType<typeof maskFor> },
) {
  const archive = await archiveContext();
  const cliches = await getSetting("creative.cliches");
  const rules = (await getSetting("compliance.sectors"))[project.sector] ?? [];
  const instructions = typeof ctx.input.instructions === "string" ? ctx.input.instructions.trim() : "";

  ctx.progress(10, "Tre direzioni creative");
  const concepts = await generateObject(
    { ...call, task: "concept.generate" },
    {
      tier: "max",
      schema: conceptsResponseSchema(
        archive.formats.map((f) => f.id),
        archive.works.map((w) => w.id),
      ),
      schemaName: "concepts",
      temperature: 0.9,
      system: `${CREATIVE_ROLE}

Proponi tre concept DAVVERO diversi fra loro (non variazioni dello stesso), uno per direzione:
- safe → ${VARIANT_BRIEF.safe}
- bold → ${VARIANT_BRIEF.bold}
- disruptive → ${VARIANT_BRIEF.disruptive}

Evita questi cliché: ${cliches.join("; ")}.
Usa la libreria dei format e le proposte passate come materiale da ricombinare, citandone solo gli ID esistenti.`,
      prompt: [
        projectHeader(project),
        rules.length ? `\nREGOLE DEL SETTORE (vincolanti):\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
        `\n${briefText}`,
        `\n${archive.text}`,
        instructions ? `\nINDICAZIONI DEL DIRETTORE CREATIVO PER QUESTA VERSIONE:\n${instructions}` : "",
      ].join("\n"),
    },
  );
  throwIfCancelled(ctx.signal);
  return concepts as Record<Variant, ConceptData>;
}

function stripIds(c: ConceptData) {
  const { formatIds: _f, referenceWorkIds: _r, ...rest } = c;
  return rest;
}

/** Concept bible dal concept scelto (eventualmente fuso con altri e con indicazioni). */
export const bibleBuild: JobHandler = async (ctx) => {
  const project = await loadProject(ctx.projectId);
  const db = getDb();
  const conceptId = String(ctx.input.conceptId ?? "");
  const mergeIds = (ctx.input.mergeConceptIds as string[] | undefined) ?? [];
  const instructions = typeof ctx.input.instructions === "string" ? ctx.input.instructions.trim() : "";
  const chosen = await db.select().from(schema.concepts).where(eq(schema.concepts.id, conceptId)).get();
  if (!chosen) throw new Error("Concept non trovato");
  const merged = mergeIds.length ? await db.select().from(schema.concepts).where(inArray(schema.concepts.id, mergeIds)).all() : [];
  const brief = await briefContext(project.id);
  const previous = await db
    .select()
    .from(schema.conceptBibles)
    .where(eq(schema.conceptBibles.projectId, project.id))
    .orderBy(desc(schema.conceptBibles.version))
    .get();

  ctx.progress(15, "Scrittura della concept bible");
  const bible = await generateObject(
    { task: "bible.build", runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) },
    {
      tier: "max",
      schema: BibleSchema,
      schemaName: "concept_bible",
      temperature: 0.6,
      system: `${CREATIVE_ROLE}
Trasforma il concept scelto nella "concept bible": il riferimento unico che tutti i moduli della proposta (scaletta, location, catering, grafica, interazione, produzione) dovranno rispettare.
Palette in esadecimale, tipografia disponibile su Google Fonts, prompt delle immagini dettagliati e senza testo nell'immagine.`,
      prompt: [
        projectHeader(project),
        brief ? `\n${brief.text}` : "",
        `\nCONCEPT SCELTO:\n${JSON.stringify(chosen.data, null, 1)}`,
        chosen.critique ? `\nOSSERVAZIONI DELLA COMMISSIONE DA RISOLVERE:\n${JSON.stringify((chosen.critique as { fixes?: string[] }).fixes ?? [])}` : "",
        merged.length ? `\nELEMENTI DA INTEGRARE DA ALTRI CONCEPT:\n${merged.map((m) => JSON.stringify(m.data)).join("\n")}` : "",
        instructions ? `\nINDICAZIONI DEL DIRETTORE CREATIVO:\n${instructions}` : "",
      ].join("\n"),
    },
  );

  const bibleId = newId("bib");
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.conceptBibles)
      .values({ id: bibleId, projectId: project.id, conceptId, version: (previous?.version ?? 0) + 1, data: bible as unknown as Record<string, unknown> })
      .run();
    await tx.update(schema.concepts).set({ status: "selected" }).where(eq(schema.concepts.id, conceptId)).run();
    await tx.update(schema.projects).set({ selectedConceptId: conceptId }).where(eq(schema.projects.id, project.id)).run();
  });
  return { bibleId };
};
