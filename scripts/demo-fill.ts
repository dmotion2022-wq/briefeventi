// Riempie un progetto con una proposta di ESEMPIO scritta a mano (dati dimostrativi, non AI),
// per vedere il flusso completo ed esaminare gli export prima di inserire la chiave Qwen.
//   npx tsx scripts/demo-fill.ts            → crea il progetto "Esempio"
//   npx tsx scripts/demo-fill.ts --delete   → lo elimina
import "@/lib/load-env";
import sharp from "sharp";
import { eq, like } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { prepareDb } from "@/db/prepare";
import { createProject } from "@/db/queries/projects";
import { createQuote } from "@/db/queries/quotes";
import { createDocument } from "@/domain/documents";
import { planQuoteFromComponents } from "@/domain/quote/from-components";
import { proposeArchiveSuppliers } from "@/domain/suppliers/propose";
import { newId } from "@/lib/ids";
import { saveFile } from "@/lib/storage";

const TITLE = "ESEMPIO · Kick-off forza vendite 2027";
await prepareDb();
const db = getDb();

if (process.argv.includes("--delete")) {
  const rows = await db.select().from(schema.projects).where(like(schema.projects.title, "ESEMPIO%")).all();
  for (const p of rows) await db.delete(schema.projects).where(eq(schema.projects.id, p.id)).run();
  console.log(`Eliminati ${rows.length} progetti di esempio`);
  process.exit(0);
}

const project = await createProject({
  title: TITLE,
  clientName: "Cliente dimostrativo Pharma",
  sector: "pharma",
  eventType: "kick-off commerciale",
  status: "preventivo",
  city: "Torino",
  region: "Piemonte",
  startDate: "2027-01-28",
  endDate: "2027-01-29",
  paxMin: 170,
  paxTarget: 180,
  paxMax: 190,
  budgetCents: 12_000_000,
  notes: "Progetto dimostrativo con contenuti scritti a mano: serve a vedere il flusso e gli export.",
});
const pid = project.id;

await createDocument({
  projectId: pid,
  kind: "brief",
  filename: "Brief (esempio).txt",
  mime: "text/plain",
  buffer: Buffer.from(
    "Buongiorno, organizziamo il kick-off commerciale 2027 per circa 180 informatori scientifici, 2 giorni con una notte a fine gennaio a Torino o dintorni. Obiettivi: presentare la strategia 2027 e il nuovo portfolio, motivare la rete dopo un anno difficile, rafforzare il senso di squadra. Servono plenaria, 4 sale breakout, cena di gala e pernottamento. Budget indicativo 120.000 euro IVA esclusa. Attenzione alle regole del codice Farmindustria.",
  ),
});

const brief = {
  summary:
    "Kick-off commerciale di due giorni con una notte per circa 180 informatori scientifici, a Torino a fine gennaio 2027: strategia 2027, nuovo portfolio e motivazione della rete dopo un anno impegnativo, nel rispetto del codice Farmindustria.",
  client: { name: "Cliente dimostrativo Pharma", sector: "pharma", notes: "Azienda farmaceutica con rete di informatori scientifici." },
  eventTitle: "Kick-off 2027",
  eventType: "kick-off commerciale",
  objectives: ["Presentare la strategia commerciale 2027", "Lanciare il nuovo portfolio", "Rimotivare la rete dopo un anno difficile", "Rafforzare il senso di squadra fra le aree"],
  keyMessages: ["Il 2027 si costruisce insieme", "Ogni territorio conta"],
  audience: { description: "Informatori scientifici e area manager", profiles: ["informatori scientifici", "area manager"], paxMin: 170, paxTarget: 180, paxMax: 190, international: false, languages: ["italiano"] },
  dates: { start: "2027-01-28", end: "2027-01-29", durationDays: 2, nights: 1, flexibility: "ultima settimana di gennaio" },
  location: { city: "Torino", region: "Piemonte", country: "IT", preferences: "raggiungibile in treno, niente località turistiche" },
  budget: { totalEuro: 120000, perPaxEuro: null, vatIncluded: false, notes: "IVA esclusa" },
  format: "in_presenza",
  requiredServices: ["plenaria", "4 sale breakout", "cena di gala", "pernottamento"],
  tone: "concreto, energico, mai autocelebrativo",
  tender: { isTender: false, deadline: null, questionsDeadline: null, deliverables: [], evaluationCriteria: [], submissionFormat: null },
  constraints: ["Codice deontologico Farmindustria: ospitalità sobria e limitata all'evento"],
  evidence: [{ field: "partecipanti", quote: "circa 180 informatori scientifici", page: 1, verified: true }],
};
await db.insert(schema.briefs).values({ id: newId("brf"), projectId: pid, version: 1, status: "confirmed", confirmedAt: new Date().toISOString(), data: brief }).run();

const concepts = {
  safe: {
    name: "Rotta 2027",
    claim: "Ogni territorio è una tappa",
    insight: "Dopo un anno difficile la rete non chiede slogan: chiede di vedere che il proprio lavoro sul territorio è parte del disegno.",
    bigIdea: "Il kick-off come una carta nautica che si completa insieme: ogni area porta la sua rotta e la strategia 2027 diventa la mappa comune.",
    narrative: "Dall'invito (una mappa da completare) alla plenaria di apertura, fino alla cena in cui la carta è finalmente intera.",
    wowMoment: { title: "La carta che si accende", description: "Durante la chiusura della plenaria le rotte di tutte le aree si illuminano su una grande mappa a terra.", when: "chiusura della plenaria del giorno 1", whyItWorks: "Rende visibile il contributo di ciascuno.", feasibility: "Proiezione a pavimento e regia luci." },
    experienceHighlights: ["Invito-mappa", "Plenaria a pianta centrale", "Breakout per territorio", "Cena dei capitani"],
    innovationTypes: ["spatial", "narrative"],
    formatIds: [],
    referenceWorkIds: [],
    venueDirection: "Spazio industriale riconvertito con grande sala a pianta libera",
    lookAndFeel: "Blu profondo, rame, linee di rotta sottili",
    budgetImpact: "mid",
    risks: ["Proiezione a pavimento da testare sul posto"],
    whyItWins: "Unisce strategia e riconoscimento senza eccessi, coerente con il codice Farmindustria.",
  },
};
const conceptId = newId("cnc");
await db
  .insert(schema.concepts)
  .values({
    id: conceptId,
    projectId: pid,
    variant: "safe",
    status: "selected",
    data: concepts.safe,
    scoreBp: 7800,
    critique: { scores: [{ criterion: "Aderenza agli obiettivi del brief", score: 8, reason: "Lega strategia e territori" }], strengths: ["Chiaro", "Sobrio"], weaknesses: ["Momento wow tecnico"], fixes: ["Prevedere un'alternativa senza proiezione"] },
  })
  .run();
await db.update(schema.projects).set({ selectedConceptId: conceptId }).where(eq(schema.projects.id, pid)).run();

const bible = {
  name: "Rotta 2027",
  claim: "Ogni territorio è una tappa",
  tone: "Concreto ed energico, parla di persone e territori, mai autocelebrativo.",
  toneWords: ["rotta", "squadra", "territorio", "concretezza"],
  narrativeArc: [
    { phase: "La mappa", description: "L'invito arriva come una carta da completare con la propria area." },
    { phase: "La rotta", description: "In plenaria la strategia 2027 traccia la direzione comune." },
    { phase: "Le tappe", description: "Nei breakout ogni territorio disegna il proprio contributo." },
    { phase: "La carta intera", description: "A cena la mappa è completa: si festeggia il viaggio che inizia." },
  ],
  keyMessages: ["Il 2027 si costruisce insieme", "Ogni territorio conta"],
  wowMoment: { title: "La carta che si accende", description: "Le rotte di tutte le aree si illuminano su una mappa a pavimento.", when: "fine plenaria, giorno 1" },
  palette: [
    { name: "Blu notte", hex: "#14213D", role: "fondo scuro" },
    { name: "Rame", hex: "#C2703D", role: "accento" },
    { name: "Azzurro rotta", hex: "#3A86FF", role: "primario" },
    { name: "Carta", hex: "#F4F1EA", role: "fondo chiaro" },
  ],
  typography: { display: "Fraunces", text: "Inter", notes: "Titoli editoriali, testi molto leggibili." },
  keyVisual: { description: "Una carta nautica stilizzata con rotte luminose che convergono al centro.", imagePrompt: "Stylized nautical chart with glowing routes converging" },
  moodboardPrompts: ["industrial hall with warm copper light", "hands drawing routes on a large map", "long table dinner in an industrial space"],
  applications: ["invito-mappa", "badge", "ledwall", "segnaletica a pavimento", "menu della cena"],
  dos: ["parlare per territori", "usare la mappa come filo"],
  donts: ["slogan motivazionali generici", "lusso ostentato"],
};
await db.insert(schema.conceptBibles).values({ id: newId("bib"), projectId: pid, conceptId, version: 1, data: bible }).run();

const slots = [
  [1, "10:00", "11:00", "registration", "Accoglienza e welcome coffee", "Ritiro della mappa personale", "La mappa"],
  [1, "11:00", "13:00", "plenary", "Plenaria: la rotta 2027", "Strategia e nuovo portfolio", "La rotta"],
  [1, "13:00", "14:15", "lunch", "Pranzo", "Pranzo a isole per territorio", null],
  [1, "14:15", "16:15", "breakout", "Breakout per territorio", "Quattro sale, un piano per area", "Le tappe"],
  [1, "16:15", "16:45", "coffee", "Coffee break", null, null],
  [1, "16:45", "18:00", "plenary", "Restituzione e la carta che si accende", "Momento wow di chiusura", "La rotta"],
  [1, "20:30", "23:30", "gala", "Cena dei capitani", "Cena placée con premiazioni dal basso", "La carta intera"],
  [2, "09:00", "10:30", "plenary", "Portfolio: casi e strumenti", "Sessione pratica con i product manager", "Le tappe"],
  [2, "10:30", "11:00", "coffee", "Coffee break", null, null],
  [2, "11:00", "12:30", "breakout", "Laboratori di territorio", "Piani d'azione per il primo trimestre", "Le tappe"],
  [2, "12:30", "13:30", "lunch", "Pranzo e partenze", null, null],
] as const;
const slotIds: string[] = [];
for (const [i, [day, start, end, kind, title, description, beat]] of slots.entries()) {
  const id = newId("slt");
  slotIds.push(id);
  await db
    .insert(schema.agendaSlots)
    .values({ id, projectId: pid, day, date: day === 1 ? "2027-01-28" : "2027-01-29", startTime: start, endTime: end, kind, title, description, narrativeBeat: beat, room: kind === "breakout" ? "Sale A-D" : kind === "gala" ? "Navata" : "Sala principale", pax: 180, position: i + 1 })
    .run();
}
const s = (i: number) => slotIds[i];
const est = (unit: number | null, fixed: number | null, min: number, max: number, basis: string) => ({
  unitCostCents: unit != null ? unit * 100 : null,
  fixedCostCents: fixed != null ? fixed * 100 : null,
  minCents: min * 100,
  maxCents: max * 100,
  basis,
});
type Comp = { category: string; title: string; description: string; slotIds: string[]; quantity: number; unit: string; periods: number; periodUnit: "none" | "night" | "day" | "hour"; pricingModel: "unit" | "per_pax" | "forfait" | "package"; supplierKind: string; estimate: ReturnType<typeof est>; optional?: boolean };
const modules: Record<string, { data: Record<string, unknown>; components: Comp[] }> = {
  venue: {
    data: {
      summary: "Uno spazio industriale riconvertito a Torino, con navata centrale per plenaria e cena e quattro sale per i breakout.",
      requirements: { plenary: { setup: "platea a pianta centrale", pax: 190 }, breakouts: [{ count: 4, pax: 50, setup: "isole" }], otherSpaces: ["foyer per accoglienza"], technical: ["altezza minima 6 m per rigging"], accessibility: "accesso senza barriere", logistics: "10 minuti dalla stazione" },
      venueTypes: ["spazio industriale", "centro congressi"],
      candidates: [{ venueId: null, name: "Spazio industriale a Torino", city: "Torino", why: "Navata ampia e sale modulari", watchouts: "Riscaldamento a gennaio da verificare" }],
      roomPlan: [{ slotIds: [s(1)], space: "Navata", setup: "platea centrale", pax: 180 }],
    },
    components: [
      { category: "location", title: "Affitto spazio (2 giorni)", description: "Navata e 4 sale, allestimento compreso", slotIds: [s(1), s(3)], quantity: 1, unit: "spazio", periods: 2, periodUnit: "day", pricingModel: "forfait", supplierKind: "venue", estimate: est(null, 7000, 12000, 16000, "listino spazi Torino in archivio") },
    ],
  },
  accommodation: {
    data: { needed: true, summary: "Hotel 4 stelle in centro a Torino, a 10 minuti dalla location.", nights: [{ date: "2027-01-28", singles: 180, doubles: 0 }], category: "4 stelle", location: "centro città", candidates: [], rules: ["Ospitalità limitata alla notte dell'evento", "Categoria entro quanto previsto dal codice Farmindustria"] },
    components: [{ category: "pernottamento", title: "Camere DUS con colazione", description: "180 camere doppie uso singola, 1 notte", slotIds: [], quantity: 180, unit: "camere", periods: 1, periodUnit: "night", pricingModel: "unit", supplierKind: "hotel", estimate: est(135, null, 22000, 27000, "4 stelle Torino gennaio") }],
  },
  catering: {
    data: {
      foodConcept: "Un viaggio fra i territori: ogni piatto racconta un'area della rete.",
      services: [
        { slotId: s(0), service: "Welcome coffee", formula: "standing", menuIdea: "Caffè e prodotti da forno piemontesi", pax: 180, dietary: "senza glutine e vegano disponibili", setting: "foyer" },
        { slotId: s(2), service: "Pranzo a isole", formula: "isole tematiche", menuIdea: "Piatti regionali in porzioni", pax: 180, dietary: "allergie segnalate in iscrizione", setting: "navata laterale" },
        { slotId: s(4), service: "Coffee break", formula: "standing", menuIdea: "Frutta e dolci leggeri", pax: 180, dietary: "-", setting: "foyer" },
        { slotId: s(6), service: "Cena dei capitani", formula: "placée", menuIdea: "Menu in 4 tappe", pax: 180, dietary: "menu alternativi", setting: "navata" },
        { slotId: s(8), service: "Coffee break", formula: "standing", menuIdea: "Caffè e succhi", pax: 180, dietary: "-", setting: "foyer" },
        { slotId: s(10), service: "Pranzo leggero", formula: "standing", menuIdea: "Lunch box regionale", pax: 180, dietary: "-", setting: "foyer" },
      ],
      sustainability: ["Prodotti del territorio", "Recupero delle eccedenze con una onlus locale"],
    },
    components: [
      { category: "catering", title: "Coffee break e welcome coffee", description: "3 servizi per 180 persone", slotIds: [s(0), s(4), s(8)], quantity: 180, unit: "pax", periods: 3, periodUnit: "none", pricingModel: "per_pax", supplierKind: "catering", estimate: est(9, null, 4200, 5600, "listino catering") },
      { category: "catering", title: "Pranzi", description: "2 pranzi per 180 persone", slotIds: [s(2), s(10)], quantity: 180, unit: "pax", periods: 2, periodUnit: "none", pricingModel: "per_pax", supplierKind: "catering", estimate: est(32, null, 10000, 13000, "mercato Torino") },
      { category: "catering", title: "Cena dei capitani", description: "Cena placée in 4 portate con servizio", slotIds: [s(6)], quantity: 180, unit: "pax", periods: 1, periodUnit: "none", pricingModel: "per_pax", supplierKind: "catering", estimate: est(68, null, 11000, 13500, "mercato Torino") },
    ],
  },
  graphic: {
    data: { identitySummary: "La carta nautica come sistema grafico: rotte, coordinate, tappe.", applications: [{ name: "Invito-mappa", description: "Mappa da completare", format: "digitale e stampa" }], signage: ["segnaletica a pavimento"], digital: ["contenuti ledwall"], imagePrompts: [] },
    components: [{ category: "comunicazione", title: "Concept grafico e declinazioni", description: "Invito, badge, ledwall, segnaletica", slotIds: [], quantity: 1, unit: "progetto", periods: 1, periodUnit: "none", pricingModel: "forfait", supplierKind: "print", estimate: est(null, 6500, 5500, 8000, "stima interna") }],
  },
  engagement: {
    data: {
      summary: "La mappa accompagna i partecipanti prima, durante e dopo l'evento.",
      before: [{ name: "La mappa da completare", description: "Ogni area invia la propria rotta prima dell'evento", slotIds: [], formatId: null, analog: false, why: "Coinvolge da subito" }],
      during: [{ name: "Premi votati dai colleghi", description: "Le aree votano i colleghi che hanno fatto la differenza", slotIds: [s(6)], formatId: null, analog: true, why: "Riconoscimento autentico" }],
      after: [{ name: "Muro degli impegni", description: "Gli impegni del primo trimestre tornano via email dopo 30 giorni", slotIds: [], formatId: null, analog: true, why: "Continuità" }],
      measurement: { kpis: [{ name: "Partecipazione alla mappa", how: "rotte inviate per area", target: "100% delle aree" }] },
    },
    components: [{ category: "engagement", title: "Meccaniche di coinvolgimento", description: "Mappa, votazioni e follow-up", slotIds: [s(6)], quantity: 1, unit: "progetto", periods: 1, periodUnit: "none", pricingModel: "forfait", supplierKind: "experience", estimate: est(null, 4000, 3000, 5500, "stima interna") }],
  },
  production: {
    data: { av: ["Audio e luci per navata", "Ledwall 6×3 m", "Proiezione a pavimento"], staging: ["Palco centrale", "Segnaletica"], staff: [{ role: "hostess", count: 6, when: "giorno 1" }], transport: [{ what: "Navetta stazione–location", pax: 180, when: "arrivo e partenza" }], safety: ["Piano di sicurezza"], permits: [], siaeNeeded: true, siaeNotes: "Musica di sottofondo alla cena", sustainability: ["Materiali riutilizzabili"] },
    components: [
      { category: "av_regia", title: "Service audio, video, luci e regia", description: "2 giorni con montaggio", slotIds: [s(1), s(5)], quantity: 1, unit: "service", periods: 2, periodUnit: "day", pricingModel: "forfait", supplierKind: "av", estimate: est(null, 9000, 15000, 21000, "preventivi service in archivio") },
      { category: "staff", title: "Hostess", description: "6 hostess per accoglienza e sale", slotIds: [s(0)], quantity: 6, unit: "hostess", periods: 2, periodUnit: "day", pricingModel: "unit", supplierKind: "staff", estimate: est(220, null, 2300, 3000, "mercato") },
      { category: "transfer", title: "Navette", description: "Stazione–location e ritorno", slotIds: [], quantity: 4, unit: "bus", periods: 2, periodUnit: "day", pricingModel: "unit", supplierKind: "transport", estimate: est(450, null, 3200, 4200, "preventivo transfer in archivio") },
      { category: "siae", title: "SIAE", description: "Musica di sottofondo alla cena", slotIds: [s(6)], quantity: 1, unit: "permesso", periods: 1, periodUnit: "none", pricingModel: "forfait", supplierKind: "other", estimate: est(null, 450, 300, 700, "tariffe SIAE") },
    ],
  },
};
for (const [kind, { data, components }] of Object.entries(modules)) {
  const moduleId = newId("mod");
  await db.insert(schema.modules).values({ id: moduleId, projectId: pid, kind: kind as never, data, builtFrom: { bible: 1 } }).run();
  await db
    .insert(schema.components)
    .values(
      components.map((c, i) => ({
        id: newId("cmp"),
        projectId: pid,
        moduleId,
        category: c.category,
        title: c.title,
        description: c.description,
        specs: { supplierKind: c.supplierKind, periodUnit: c.periodUnit, estimate: c.estimate },
        slotIds: c.slotIds,
        quantityHint: c.quantity,
        unitHint: c.unit,
        periodsHint: c.periods,
        pricingModelHint: c.pricingModel,
        optional: c.optional ?? false,
        position: i + 1,
      })),
    )
    .run();
}

// preventivo dai componenti, come fa il pulsante "Genera il preventivo"
const comps = await db.select().from(schema.components).where(eq(schema.components.projectId, pid)).all();
const plan = planQuoteFromComponents(
  comps.map((c) => ({ ...c, specs: c.specs as never })),
  await db.select().from(schema.checklistItems).all(),
);
const quoteId = await createQuote(pid, `Preventivo ${TITLE}`);
const sectionIds = new Map<string, string>();
for (const sec of plan.sections) {
  const id = newId("qsc");
  sectionIds.set(sec.title, id);
  await db.insert(schema.quoteSections).values({ id, quoteId, position: sec.position, title: sec.title }).run();
}
for (const l of plan.lines) {
  const { sectionTitle, ...line } = l;
  await db.insert(schema.quoteLines).values({ id: newId("qln"), quoteId, sectionId: sectionIds.get(sectionTitle)!, ...line }).run();
}
await db.update(schema.quotes).set({ agencyFeeBp: 1000 }).where(eq(schema.quotes.id, quoteId)).run();
const links = await proposeArchiveSuppliers(pid, quoteId);

// immagini segnaposto astratte (nessuna AI): gradienti con la palette della bible
const svg = (w: number, h: number, a: string, b: string, c: string, seed: number) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${Array.from({ length: 9 }, (_, i) => `<path d="M ${(i * 137 + seed) % w} ${h} C ${w / 3} ${(i * 61 + seed) % h}, ${(2 * w) / 3} ${(i * 97) % h}, ${w} ${(i * 43 + seed) % h}" stroke="${c}" stroke-opacity="0.55" stroke-width="${2 + (i % 3)}" fill="none"/>`).join("")}<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 10}" fill="${c}" fill-opacity="0.35"/></svg>`);
const images = [
  { purpose: "key_visual" as const, size: "1664*928", colors: ["#14213D", "#3A86FF", "#C2703D"] },
  { purpose: "moodboard" as const, size: "1328*1328", colors: ["#C2703D", "#14213D", "#F4F1EA"] },
  { purpose: "moodboard" as const, size: "1328*1328", colors: ["#3A86FF", "#F4F1EA", "#C2703D"] },
  { purpose: "moodboard" as const, size: "1328*1328", colors: ["#14213D", "#C2703D", "#3A86FF"] },
];
for (const [i, img] of images.entries()) {
  const [w, h] = img.size.split("*").map(Number);
  const id = newId("img");
  const rel = await saveFile(`images/${id}.png`, await sharp(svg(w, h, img.colors[0], img.colors[1], img.colors[2], i * 97)).png().toBuffer(), "image/png");
  await db.insert(schema.imageAssets).values({ id, projectId: pid, purpose: img.purpose, prompt: "Segnaposto astratto (esempio, nessuna AI)", model: "segnaposto", size: img.size, path: rel, width: w, height: h, selected: i === 0 }).run();
}
console.log(`Creato ${project.code} "${TITLE}" con preventivo, ${links} fornitori proposti dall'archivio e ${images.length} immagini segnaposto.`);
console.log(`Apri http://localhost:3100/projects/${pid}`);
