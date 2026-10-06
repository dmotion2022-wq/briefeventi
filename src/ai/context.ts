import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { buildMask, type Mask } from "./mask";

// Contesto comune passato all'AI nelle varie fasi. L'ordine è stabile (prima ciò che cambia
// meno) così la cache di contesto di Model Studio lavora e le risposte restano coerenti.

export type Project = typeof schema.projects.$inferSelect;

export const MAX_DOCUMENT_CHARS = 400_000;

export async function projectDocuments(projectId: string) {
  const db = getDb();
  const docs = await db.select().from(schema.documents).where(eq(schema.documents.projectId, projectId)).orderBy(asc(schema.documents.createdAt)).all();
  return Promise.all(
    docs.map(async (d) => ({
      document: d,
      pages: await db
        .select()
        .from(schema.documentPages)
        .where(eq(schema.documentPages.documentId, d.id))
        .orderBy(asc(schema.documentPages.pageNumber))
        .all(),
    })),
  );
}

/** Testo dei documenti del progetto con i marcatori [PAGINA n] usati per le citazioni. */
export async function documentsText(projectId: string) {
  let out = "";
  let truncated = false;
  for (const { document, pages } of await projectDocuments(projectId)) {
    out += `\n=== DOCUMENTO: ${document.filename} ===\n`;
    for (const p of pages) {
      if (!p.text) continue;
      const block = `[PAGINA ${p.pageNumber}]\n${p.text}\n`;
      if (out.length + block.length > MAX_DOCUMENT_CHARS) {
        truncated = true;
        break;
      }
      out += block;
    }
  }
  return { text: out.trim(), truncated };
}

export function projectHeader(p: Project) {
  return [
    `Progetto: ${p.title} (${p.code})`,
    `Cliente: ${p.clientName} · settore: ${p.sector}`,
    p.eventType ? `Tipo di evento indicato: ${p.eventType}` : null,
    p.isTender ? `Gara: sì${p.tenderDeadline ? `, scadenza ${p.tenderDeadline}` : ""}` : null,
    p.notes ? `Note interne: ${p.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const maskFor = (p: Project): Mask | undefined =>
  p.confidential ? buildMask(p.clientName, p.confidentialTerms ?? []) : undefined;

export function latestBrief(projectId: string, opts: { confirmedOnly?: boolean } = {}) {
  const db = getDb();
  const where = opts.confirmedOnly
    ? and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.status, "confirmed"))
    : eq(schema.briefs.projectId, projectId);
  return db.select().from(schema.briefs).where(where).orderBy(desc(schema.briefs.version)).get();
}

/** Brief confermato + risposte del cliente e ipotesi accettate: la base di tutte le fasi creative. */
export async function briefContext(projectId: string) {
  const db = getDb();
  const brief = (await latestBrief(projectId, { confirmedOnly: true })) ?? (await latestBrief(projectId));
  if (!brief) return null;
  const gaps = await db.select().from(schema.gapItems).where(eq(schema.gapItems.briefId, brief.id)).all();
  const answers = gaps
    .filter((g) => g.answer || g.assumptionAccepted)
    .map((g) => `- ${g.checklistKey}: ${g.answer ? `risposta del cliente: ${g.answer}` : `ipotesi accettata: ${g.assumption}`}`);
  const { evidence: _evidence, ...data } = brief.data as Record<string, unknown>;
  return {
    brief,
    text: [
      "BRIEF STRUTTURATO (JSON):",
      JSON.stringify(data, null, 1),
      answers.length ? `\nRISPOSTE E IPOTESI CONCORDATE:\n${answers.join("\n")}` : "",
    ].join("\n"),
  };
}

export function latestBible(projectId: string) {
  return getDb()
    .select()
    .from(schema.conceptBibles)
    .where(eq(schema.conceptBibles.projectId, projectId))
    .orderBy(desc(schema.conceptBibles.version))
    .get();
}

export async function bibleContext(projectId: string) {
  const bible = await latestBible(projectId);
  return bible ? { bible, text: `CONCEPT BIBLE (riferimento vincolante, versione ${bible.version}):\n${JSON.stringify(bible.data, null, 1)}` } : null;
}

export function agendaSlotsOf(projectId: string) {
  return getDb()
    .select()
    .from(schema.agendaSlots)
    .where(eq(schema.agendaSlots.projectId, projectId))
    .orderBy(asc(schema.agendaSlots.day), asc(schema.agendaSlots.position))
    .all();
}

export async function agendaContext(projectId: string) {
  const slots = await agendaSlotsOf(projectId);
  if (!slots.length) return null;
  const lines = slots.map(
    (s) =>
      `[${s.id}] giorno ${s.day}${s.date ? ` (${s.date})` : ""} ${s.startTime}-${s.endTime} · ${s.kind} · ${s.title}${s.room ? ` · ${s.room}` : ""}${s.pax ? ` · ${s.pax} pax` : ""}${s.narrativeBeat ? ` · fase: ${s.narrativeBeat}` : ""}`,
  );
  return { slots, text: `SCALETTA (usa gli ID tra parentesi quadre):\n${lines.join("\n")}` };
}

export async function venuesArchiveText() {
  const venues = await getDb().select().from(schema.venues).all();
  return {
    venues,
    text: [
      "LOCATION, HOTEL E DMC IN ARCHIVIO (usa gli ID tra parentesi quadre):",
      ...venues.map(
        (v) =>
          `[${v.id}] ${v.name} · ${[v.city, v.region, v.country].filter(Boolean).join(", ")} · ${v.assetType ?? ""} ${v.locationType ?? ""}${v.capacityMax ? ` · fino a ${v.capacityMax} pax` : ""}${v.rooms ? ` · ${v.rooms} camere` : ""}${v.usp ? ` · ${v.usp}` : ""}${v.bestFor ? ` · adatta per ${v.bestFor}` : ""}`,
      ),
    ].join("\n"),
  };
}

export async function benchmarksText() {
  const rows = await getDb().select().from(schema.priceBenchmarks).where(eq(schema.priceBenchmarks.reviewStatus, "approved")).all();
  const eur = (c: number | null) => (c == null ? "" : `${(c / 100).toLocaleString("it-IT")} €`);
  return [
    "PREZZI REALI DAI PREVENTIVI IN ARCHIVIO (riferimento per le stime, IVA come indicato):",
    ...rows.map(
      (b) =>
        `- ${b.category} · ${b.supplierName ?? "fornitore"} · ${b.city ?? ""} · ${b.useCase ?? ""}${b.paxRef ? ` · ${b.paxRef} pax` : ""} · ${b.pricingModelLabel ?? b.pricingModel}${b.unitCostCents ? ` · unitario ${eur(b.unitCostCents)}` : ""}${b.totalCents ? ` · totale ${eur(b.totalCents)}` : ""}${b.included ? ` · incluso: ${b.included}` : ""} · IVA ${b.vatIncluded === "yes" ? "inclusa" : b.vatIncluded === "no" ? "esclusa" : "da verificare"}`,
    ),
  ].join("\n");
}
