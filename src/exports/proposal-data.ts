import fs from "node:fs";
import { and, desc, eq, ne } from "drizzle-orm";
import { agendaSlotsOf, latestBible, latestBrief } from "@/ai/context";
import type { BriefData } from "@/ai/schemas/brief";
import type { BibleData, ConceptData } from "@/ai/schemas/creative";
import type { ModuleData } from "@/ai/schemas/development";
import { getDb, schema } from "@/db/client";
import { computeForQuote, currentQuote } from "@/db/queries/quotes";
import { dataPath } from "@/lib/paths";
import { getSetting } from "@/lib/settings";

// Tutto ciò che serve per presentazione, pagina web e PDF, letto una volta sola:
// i tre export partono dagli stessi dati e restano coerenti fra loro.

export type ProposalData = ReturnType<typeof loadProposal>;

export function loadProposal(projectId: string) {
  const db = getDb();
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw new Error("Progetto non trovato");
  const brief = latestBrief(projectId);
  const conceptRow =
    (project.selectedConceptId && db.select().from(schema.concepts).where(eq(schema.concepts.id, project.selectedConceptId)).get()) ||
    db
      .select()
      .from(schema.concepts)
      .where(and(eq(schema.concepts.projectId, projectId), ne(schema.concepts.status, "discarded")))
      .orderBy(desc(schema.concepts.scoreBp))
      .get();
  const bibleRow = latestBible(projectId);
  const modules = Object.fromEntries(
    db
      .select()
      .from(schema.modules)
      .where(eq(schema.modules.projectId, projectId))
      .all()
      .map((m) => [m.kind, m.data]),
  ) as Partial<ModuleData>;
  const images = db.select().from(schema.imageAssets).where(eq(schema.imageAssets.projectId, projectId)).orderBy(desc(schema.imageAssets.createdAt)).all();
  const keyVisual = images.find((i) => i.selected) ?? images.find((i) => i.purpose === "key_visual");
  const moodboard = images.filter((i) => i.id !== keyVisual?.id).slice(0, 6);
  const quote = currentQuote(projectId);
  const venues = new Map(db.select({ id: schema.venues.id, name: schema.venues.name, city: schema.venues.city }).from(schema.venues).all().map((v) => [v.id, v]));
  const formats = new Map(db.select({ id: schema.formatIdeas.id, name: schema.formatIdeas.name }).from(schema.formatIdeas).all().map((f) => [f.id, f.name]));

  return {
    project,
    agency: getSetting("agency"),
    brief: brief ? (brief.data as unknown as BriefData) : null,
    concept: conceptRow ? (conceptRow.data as unknown as ConceptData) : null,
    bible: bibleRow ? (bibleRow.data as unknown as BibleData) : null,
    slots: agendaSlotsOf(projectId),
    modules,
    keyVisual,
    moodboard,
    quote: quote ? computeForQuote(quote.id) : null,
    venueName: (id: string | null | undefined) => (id ? venues.get(id)?.name ?? null : null),
    formatName: (id: string | null | undefined) => (id ? formats.get(id) ?? null : null),
    imagePath: (img: { path: string } | undefined) => (img && fs.existsSync(dataPath(img.path)) ? dataPath(img.path) : null),
  };
}

/** Colori dell'evento dalla bible, con il brand Factory Studios come ripiego. */
export function eventColors(d: ProposalData) {
  const palette = d.bible?.palette ?? [];
  const clean = (hex: string | undefined, fallback: string) => (hex && /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace("#", "").toUpperCase() : fallback);
  const byRole = (re: RegExp) => palette.find((p) => re.test(p.role))?.hex;
  return {
    primary: clean(byRole(/primar/i) ?? palette[0]?.hex, "6C4DF6"),
    accent: clean(byRole(/accent/i) ?? palette[1]?.hex, "ED3E7E"),
    dark: clean(byRole(/scur|dark|fondo|testo/i) ?? palette.find((p) => isDark(p.hex))?.hex, "191521"),
    light: clean(byRole(/chiar|light|carta|paper/i) ?? palette.find((p) => !isDark(p.hex))?.hex, "F6F4F0"),
  };
}

export function isDark(hex: string | undefined) {
  if (!hex) return false;
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export const formatDayDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)) : null;
