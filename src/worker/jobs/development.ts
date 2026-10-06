import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { generateObject } from "@/ai/generate";
import {
  agendaContext,
  agendaSlotsOf,
  benchmarksText,
  bibleContext,
  briefContext,
  maskFor,
  projectHeader,
  venuesArchiveText,
} from "@/ai/context";
import { agendaSchema, MODULE_BRIEFS, MODULE_ORDER, moduleSchemas, type ComponentData, type ModuleKind } from "@/ai/schemas/development";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { eurosToCents } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import type { JobHandler } from "../context";
import { throwIfCancelled } from "../context";

const ROLE = `Sei il project manager senior e il producer di Factory Studios / YEG!, agenzia italiana di eventi corporate.
Trasformi il concept scelto in un evento concreto, realizzabile e coerente in ogni dettaglio.
Rispetti la concept bible, la scaletta e i vincoli del brief; scrivi in italiano, in modo operativo.`;

function loadProject(projectId: string | null) {
  if (!projectId) throw new Error("Progetto mancante");
  const project = getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw new Error("Progetto non trovato");
  return project;
}

/** Scaletta giorno per giorno; in rigenerazione gli slot esistenti mantengono il loro ID. */
export const agendaDevelop: JobHandler = async (ctx) => {
  const project = loadProject(ctx.projectId);
  const db = getDb();
  const brief = briefContext(project.id);
  const bible = bibleContext(project.id);
  if (!brief || !bible) throw new Error("Servono il brief e la concept bible");
  const existing = agendaSlotsOf(project.id);
  const instructions = typeof ctx.input.instructions === "string" ? ctx.input.instructions.trim() : "";

  ctx.progress(15, "Scrittura della scaletta");
  const agenda = await generateObject(
    { task: "agenda.develop", runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) },
    {
      tier: "max",
      schema: agendaSchema(existing.map((s) => s.id)),
      schemaName: "agenda",
      temperature: 0.4,
      system: `${ROLE}
Scrivi la scaletta completa dell'evento, giorno per giorno: accoglienza e registrazione, sessioni, pause, pasti, attività, transfer, momento wow.
Orari realistici (tempi di cambio sala, pasti, spostamenti). Ogni slot porta avanti una fase dell'arco narrativo della bible.
Se esistono già slot, mantieni l'ID (keepId) di quelli che restano, anche se ne cambi orario o titolo.`,
      prompt: [
        projectHeader(project),
        `\n${brief.text}`,
        `\n${bible.text}`,
        existing.length
          ? `\nSCALETTA ATTUALE:\n${existing.map((s) => `[${s.id}] g${s.day} ${s.startTime}-${s.endTime} ${s.kind} ${s.title}`).join("\n")}`
          : "",
        instructions ? `\nINDICAZIONI:\n${instructions}` : "",
      ].join("\n"),
    },
  );
  throwIfCancelled(ctx.signal);

  const dates = new Map(agenda.days.map((d) => [d.day, d.date]));
  const keep = new Set(agenda.slots.map((s) => s.keepId).filter(Boolean));
  db.transaction((tx) => {
    for (const old of existing) if (!keep.has(old.id)) tx.delete(schema.agendaSlots).where(eq(schema.agendaSlots.id, old.id)).run();
    agenda.slots
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
      .forEach((s, i) => {
        const values = {
          projectId: project.id,
          day: s.day,
          date: dates.get(s.day) ?? null,
          startTime: s.start,
          endTime: s.end,
          kind: s.kind,
          title: s.title,
          description: s.description,
          room: s.room,
          pax: s.pax,
          narrativeBeat: s.narrativeBeat,
          position: i + 1,
        };
        if (s.keepId && existing.some((e) => e.id === s.keepId)) {
          tx.update(schema.agendaSlots).set(values).where(eq(schema.agendaSlots.id, s.keepId)).run();
        } else {
          tx.insert(schema.agendaSlots).values({ id: newId("slt"), ...values }).run();
        }
      });
  });
  if (project.status === "concept") db.update(schema.projects).set({ status: "sviluppo" }).where(eq(schema.projects.id, project.id)).run();
  return { slots: agenda.slots.length, days: agenda.days.length, notes: agenda.notes };
};

/** I sei moduli della proposta, agganciati agli slot. Si può rigenerare un solo modulo con indicazioni. */
export const modulesDevelop: JobHandler = async (ctx) => {
  const project = loadProject(ctx.projectId);
  const db = getDb();
  const brief = briefContext(project.id);
  const bible = bibleContext(project.id);
  const agenda = agendaContext(project.id);
  if (!brief || !bible || !agenda) throw new Error("Servono brief, concept bible e scaletta");
  const kinds = ((ctx.input.kinds as ModuleKind[] | undefined) ?? MODULE_ORDER).filter((k) => MODULE_ORDER.includes(k));
  const instructions = typeof ctx.input.instructions === "string" ? ctx.input.instructions.trim() : "";

  const checklist = db
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
  const venues = venuesArchiveText();
  const formats = db.select().from(schema.formatIdeas).where(eq(schema.formatIdeas.active, true)).all();
  const schemas = moduleSchemas({
    slots: agenda.slots.map((s) => s.id),
    categories: checklist.map((c) => c.key),
    venues: venues.venues.map((v) => v.id),
    formats: formats.map((f) => f.id),
  });
  const rules = getSetting("compliance.sectors")[project.sector] ?? [];

  // prefisso identico per tutti i moduli: la cache di contesto lavora e il racconto resta coerente
  const prefix = [
    projectHeader(project),
    rules.length ? `\nREGOLE DEL SETTORE (vincolanti):\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
    `\n${brief.text}`,
    `\n${bible.text}`,
    `\n${agenda.text}`,
    `\nCATEGORIE DI COSTO (checklist):\n${checklist.map((c) => `- ${c.key}: ${c.label}`).join("\n")}`,
    `\n${venues.text}`,
    `\nFORMAT DELLA LIBRERIA:\n${formats.map((f) => `[${f.id}] ${f.name}: ${f.description}`).join("\n")}`,
    `\n${benchmarksText()}`,
  ].join("\n");

  const done: string[] = [];
  let step = 0;
  for (const kind of kinds) {
    throwIfCancelled(ctx.signal);
    ctx.progress(5 + (step / kinds.length) * 90, `Modulo: ${MODULE_BRIEFS[kind].split(":")[0].toLowerCase()}`);
    const current = db.select().from(schema.modules).where(and(eq(schema.modules.projectId, project.id), eq(schema.modules.kind, kind))).get();
    const data = await generateObject(
      { task: `module.${kind}`, runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) },
      {
        tier: "max",
        // ogni modulo ha il suo schema; qui basta sapere che contiene i componenti
        schema: schemas[kind] as unknown as z.ZodType<Record<string, unknown> & { components: ComponentData[] }>,
        schemaName: `module_${kind}`,
        temperature: 0.5,
        system: `${ROLE}
Stai scrivendo il modulo ${MODULE_BRIEFS[kind]}
Elenca in "components" le voci di costo che servono a realizzarlo (una per fornitore o servizio), con quantità coerenti con partecipanti, giorni e notti, gli slot a cui servono e una stima netta IVA con forchetta min–max. Usa i prezzi reali dell'archivio come riferimento quando pertinenti e dichiaralo in "basis".`,
        prompt: [
          prefix,
          current && instructions ? `\nVERSIONE ATTUALE DEL MODULO:\n${JSON.stringify(current.data)}` : "",
          instructions ? `\nINDICAZIONI PER QUESTA VERSIONE:\n${instructions}` : "",
        ].join("\n"),
      },
    );
    saveModule(project.id, kind, data, ctx.runId);
    done.push(kind);
    step++;
  }
  return { modules: done };
};

function saveModule(projectId: string, kind: ModuleKind, data: Record<string, unknown> & { components: ComponentData[] }, runId: string) {
  const db = getDb();
  const bible = bibleContext(projectId)?.bible;
  const { components, ...rest } = data;
  db.transaction((tx) => {
    const existing = tx.select().from(schema.modules).where(and(eq(schema.modules.projectId, projectId), eq(schema.modules.kind, kind))).get();
    const moduleId = existing?.id ?? newId("mod");
    const values = {
      projectId,
      kind,
      data: rest,
      status: "draft" as const,
      builtFrom: { bible: bible?.version ?? 0 },
      runId,
    };
    if (existing) tx.update(schema.modules).set(values).where(eq(schema.modules.id, moduleId)).run();
    else tx.insert(schema.modules).values({ id: moduleId, ...values }).run();
    tx.delete(schema.components).where(eq(schema.components.moduleId, moduleId)).run();
    components.forEach((c, i) =>
      tx
        .insert(schema.components)
        .values({
          id: newId("cmp"),
          projectId,
          moduleId,
          category: c.category,
          title: c.title,
          description: c.description,
          specs: {
            supplierKind: c.supplierKind,
            periodUnit: c.periodUnit,
            estimate: {
              unitCostCents: c.estimate.unitCostEuro != null ? eurosToCents(c.estimate.unitCostEuro) : null,
              fixedCostCents: c.estimate.fixedCostEuro != null ? eurosToCents(c.estimate.fixedCostEuro) : null,
              minCents: eurosToCents(c.estimate.minEuro),
              maxCents: eurosToCents(c.estimate.maxEuro),
              basis: c.estimate.basis,
            },
          },
          slotIds: c.slotIds,
          quantityHint: c.quantity,
          unitHint: c.unit,
          periodsHint: c.periods,
          pricingModelHint: c.pricingModel,
          optional: c.optional,
          position: i + 1,
        })
        .run(),
    );
  });
}
