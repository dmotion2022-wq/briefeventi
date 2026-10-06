import { count } from "drizzle-orm";
import { newId } from "@/lib/ids";
import type { Db } from "./client";
import { PLATFORM_SEED, PLATFORMS_VERIFIED_AT } from "./platforms-seed";
import * as schema from "./schema";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";

// Regimi IVA: valori di partenza, modificabili da Impostazioni.
// Da validare con il commercialista prima dell'uso su un preventivo reale.
const VAT_REGIMES: (typeof schema.vatRegimes.$inferInsert)[] = [
  { code: "IVA22", label: "IVA ordinaria 22%", kind: "standard", rateBp: 2200, position: 1 },
  {
    code: "IVA10",
    label: "IVA ridotta 10% (alloggio, somministrazione, trasporto persone)",
    kind: "standard",
    rateBp: 1000,
    position: 2,
  },
  { code: "IVA4", label: "IVA ridotta 4%", kind: "standard", rateBp: 400, position: 3 },
  {
    code: "74TER",
    label: "Regime speciale agenzie di viaggio (art. 74-ter)",
    kind: "margin_74ter",
    rateBp: 2200,
    invoiceNote:
      "Operazione soggetta al regime speciale di cui all'art. 74-ter DPR 633/72: IVA non esposta in fattura.",
    position: 4,
  },
  {
    code: "ART15",
    label: "Spese anticipate in nome e per conto (art. 15)",
    kind: "art15",
    rateBp: 0,
    allowMarkup: false,
    invoiceNote: "Escluso dalla base imponibile ai sensi dell'art. 15 DPR 633/72.",
    position: 5,
  },
  {
    code: "ESENTE",
    label: "Esente (art. 10)",
    kind: "exempt",
    rateBp: 0,
    invoiceNote: "Operazione esente ai sensi dell'art. 10 DPR 633/72.",
    position: 6,
  },
  {
    code: "FC",
    label: "Fuori campo IVA",
    kind: "out_of_scope",
    rateBp: 0,
    invoiceNote: "Operazione fuori campo IVA (es. artt. 7-ter / 7-quater DPR 633/72).",
    position: 7,
  },
];

type Checklist = typeof schema.checklistItems.$inferInsert;
const CHECKLIST: Omit<Checklist, "position">[] = [
  {
    key: "location",
    label: "Location e sede",
    description: "Scelta della venue: tipologia, posizione, accessibilità, esclusiva, costi di affitto.",
    defaultSection: "Location e sale",
  },
  {
    key: "sale_allestimento",
    label: "Sale e setup",
    description:
      "Plenaria, breakout e foyer: capienze per setup (platea, banchi, cabaret, banchetto), altezze, layout, pre e disallestimento.",
    defaultSection: "Location e sale",
  },
  {
    key: "pernottamento",
    label: "Pernottamento",
    description:
      "Camere (singole, DUS, doppie), notti, categoria e distanza dalla venue, rooming list, check-in/out.",
    defaultSection: "Ospitalità",
    defaultVatRegime: "IVA10",
    defaultMarkupBp: 1000,
  },
  {
    key: "catering",
    label: "Catering e F&B",
    description:
      "Welcome coffee, coffee break, pranzi, cene e gala: formula, menu, intolleranze e diete, servizio, sostenibilità.",
    defaultSection: "Food & beverage",
    defaultVatRegime: "IVA10",
  },
  {
    key: "av_regia",
    label: "Audio, video, luci e regia",
    description:
      "Service tecnico, ledwall, proiezione, microfoni, regia video, registrazione, streaming, interpretariato.",
    defaultSection: "Produzione tecnica",
  },
  {
    key: "allestimenti",
    label: "Allestimenti e scenografia",
    description: "Palco, scenografia, arredi, segnaletica, branding degli spazi, montaggio e smontaggio.",
    defaultSection: "Allestimenti",
  },
  {
    key: "transfer",
    label: "Viaggi e transfer",
    description: "Viaggi, navette, transfer da aeroporto o stazione, bus GT, parcheggi e logistica arrivi.",
    defaultSection: "Trasporti",
    defaultVatRegime: "IVA10",
  },
  {
    key: "staff",
    label: "Staff e servizi in loco",
    description: "Hostess, steward, accoglienza, guardaroba, interpreti, fotografo e videomaker.",
    defaultSection: "Staff e servizi",
  },
  {
    key: "registrazione",
    label: "Inviti, registrazione e accrediti",
    description: "Piattaforma di iscrizione, comunicazioni ai partecipanti, badge, check-in, gestione liste.",
    defaultSection: "Segreteria e accrediti",
  },
  {
    key: "comunicazione",
    label: "Concept grafico e comunicazione",
    description:
      "Identità dell'evento, key visual e declinazioni: inviti, badge, palco, segnaletica, social, materiali.",
    defaultSection: "Creatività e comunicazione",
  },
  {
    key: "engagement",
    label: "Interazione ed engagement",
    description: "Meccaniche di coinvolgimento prima, durante e dopo l'evento, legate alla scaletta e misurabili.",
    defaultSection: "Esperienza ed engagement",
  },
  {
    key: "intrattenimento",
    label: "Intrattenimento, speaker e team building",
    description: "Artisti, ospiti, moderatore, speaker, attività di gruppo.",
    defaultSection: "Esperienza ed engagement",
  },
  {
    key: "gadget",
    label: "Gadget e materiali",
    description: "Welcome kit, gadget, stampati, materiali per i partecipanti.",
    defaultSection: "Creatività e comunicazione",
  },
  {
    key: "sicurezza_permessi",
    label: "Sicurezza, permessi e assicurazioni",
    description:
      "Piano di sicurezza, presidio medico, antincendio, permessi comunali, commissione di vigilanza, RC eventi.",
    defaultSection: "Sicurezza e permessi",
  },
  {
    key: "siae",
    label: "SIAE e diritti",
    description: "Diritti per musica dal vivo o registrata, immagini e contenuti protetti.",
    defaultSection: "Sicurezza e permessi",
  },
  {
    key: "sostenibilita",
    label: "Sostenibilità",
    description: "Riduzione di rifiuti e plastica, km0, mobilità, misurazione e compensazione, criteri ISO 20121.",
    defaultSection: "Sostenibilità",
  },
  {
    key: "compliance",
    label: "Compliance di settore",
    description:
      "Regole del settore del cliente e policy interne su ospitalità, omaggi e contenuti. Da verificare con il compliance del cliente.",
    defaultSection: "Consulenza e compliance",
  },
  {
    key: "ecm",
    label: "Accreditamento ECM",
    description: "Provider ECM, crediti formativi, questionari di apprendimento e rilevazione presenze.",
    defaultSection: "Consulenza e compliance",
    sectors: ["pharma", "medtech"],
  },
  {
    key: "misurazione",
    label: "Misurazione e report",
    description: "KPI delle interazioni, raccolta dati, report post evento (aggancio a D*motion in fase 2).",
    defaultSection: "Data e misurazione",
  },
  {
    key: "segreteria",
    label: "Project management e segreteria",
    description: "Coordinamento, sopralluoghi, project management, assistenza in loco, segreteria organizzativa.",
    defaultSection: "Management",
    defaultMarkupBp: 0,
  },
  {
    key: "budget",
    label: "Budget e condizioni economiche",
    description: "Budget disponibile o per partecipante, modalità di pagamento, voci a carico del cliente.",
    defaultSection: "Management",
    defaultMarkupBp: 0,
  },
];

type FormatSeed = Omit<typeof schema.formatIdeas.$inferInsert, "id">;
const FORMATS: FormatSeed[] = [
  {
    name: "Silent conference",
    type: "format",
    description:
      "Plenaria o breakout in cuffia: più sessioni in parallelo nello stesso spazio, attenzione altissima e nessun rimbombo. Funziona anche in location non convenzionali.",
    costLevel: "mid",
    suppliersHint: "Noleggio cuffie e trasmettitori silent (es. Silent Emotion)",
    paxMin: 20,
    paxMax: 1500,
    tags: ["audio", "attenzione", "location non convenzionali"],
  },
  {
    name: "Cena-racconto",
    type: "food",
    description:
      "Ogni portata è un capitolo del messaggio: chef e narratore costruiscono la cena come uno spettacolo e i piatti traducono i valori o il prodotto.",
    costLevel: "high",
    paxMin: 20,
    paxMax: 400,
    tags: ["storytelling", "food", "gala"],
  },
  {
    name: "Laboratori hands-on",
    type: "learning",
    description:
      "I partecipanti sperimentano con le mani il prodotto o la scienza dietro il brand (esperimenti, prove, prototipi), con badge di avanzamento.",
    costLevel: "mid",
    paxMin: 30,
    paxMax: 1500,
    tags: ["scienza", "esperienza", "family day"],
  },
  {
    name: "Passaporto esperienziale",
    type: "narrative",
    description:
      "Un passaporto fisico (e volendo digitale) con timbri o badge da raccogliere lungo le tappe: guida i flussi e misura la partecipazione.",
    costLevel: "low",
    paxMin: 50,
    paxMax: 5000,
    tags: ["percorso", "gamification", "misurazione"],
  },
  {
    name: "Viaggio a tappe con diario di bordo",
    type: "narrative",
    description:
      "Il gruppo vive l'evento come un viaggio con tappe (riflessione, creatività, collaborazione) raccolte in un diario collettivo che diventa il ricordo.",
    costLevel: "mid",
    paxMin: 15,
    paxMax: 300,
    tags: ["team building", "valori", "viaggio"],
  },
  {
    name: "Talk-show al posto delle slide",
    type: "format",
    description:
      "Il palco diventa un salotto con un conduttore: domande dal pubblico, ospiti a rotazione, contenuti che nascono dal confronto e non dalle slide.",
    costLevel: "mid",
    paxMin: 50,
    paxMax: 2000,
    tags: ["plenaria", "contenuti", "moderazione"],
  },
  {
    name: "Open space (agenda scritta dai partecipanti)",
    type: "format",
    description:
      "Una parte dell'agenda la scrivono i partecipanti a inizio giornata: sessioni auto-organizzate su temi proposti dal basso.",
    costLevel: "low",
    paxMin: 20,
    paxMax: 400,
    tags: ["partecipazione", "breakout", "innovazione"],
  },
  {
    name: "Walking session",
    type: "wellbeing",
    description:
      "Breakout camminando all'aperto in piccoli gruppi con una domanda guida e restituzione in plenaria: più energia e idee migliori che seduti.",
    costLevel: "low",
    paxMin: 10,
    paxMax: 300,
    tags: ["outdoor", "breakout", "benessere"],
  },
  {
    name: "Teatro d'impresa interattivo",
    type: "learning",
    description:
      "Attori professionisti mettono in scena situazioni di lavoro reali; il pubblico interviene e cambia il finale.",
    costLevel: "mid",
    paxMin: 30,
    paxMax: 800,
    tags: ["formazione", "emozione", "plenaria"],
  },
  {
    name: "Proiezione immersiva",
    type: "spatial",
    description:
      "Mapping o proiezioni a 360° che trasformano la sala nel mondo del concept, con un momento di apertura in silenzio e musica.",
    costLevel: "high",
    suppliersHint: "Spazi con proiezione immersiva (es. Spazio CARGO, Roma)",
    paxMin: 30,
    paxMax: 1000,
    tags: ["wow", "apertura", "immersivo"],
  },
  {
    name: "Spazio aziendale trasformato",
    type: "spatial",
    description:
      "Stabilimento, magazzino o showroom del cliente trasformati in percorso esperienziale, al posto della solita sala d'albergo.",
    costLevel: "mid",
    paxMin: 50,
    paxMax: 3000,
    tags: ["heritage", "plant visit", "autenticità"],
  },
  {
    name: "Esperienza nel territorio",
    type: "social",
    description:
      "Attività con artigiani, produttori e realtà locali (bottega, cantina, laboratorio) che legano i valori aziendali al luogo, al posto della visita turistica.",
    costLevel: "mid",
    paxMin: 10,
    paxMax: 300,
    tags: ["territorio", "artigianato", "incentive"],
  },
  {
    name: "Team building a impatto sociale",
    type: "social",
    description:
      "Il gruppo realizza qualcosa di utile per una comunità locale (orti, kit scolastici, riqualificazioni): il ricordo è anche un impatto.",
    costLevel: "mid",
    paxMin: 20,
    paxMax: 1000,
    tags: ["CSR", "team building", "sostenibilità"],
  },
  {
    name: "Sfida a squadre con classifica live",
    type: "tech",
    description:
      "Sfide a squadre lungo tutto l'evento, collegate ai contenuti, con classifica live (anche analogica) e premiazione finale.",
    costLevel: "low",
    paxMin: 30,
    paxMax: 2000,
    tags: ["gamification", "squadre", "misurazione"],
  },
  {
    name: "Domande e sondaggi dal pubblico",
    type: "tech",
    description:
      "Sondaggi e domande in tempo reale dallo smartphone mostrati sul ledwall: il pubblico orienta la sessione e i dati alimentano il report.",
    costLevel: "low",
    paxMin: 30,
    paxMax: 5000,
    tags: ["plenaria", "dati", "interazione"],
  },
  {
    name: "Accoglienza multisensoriale",
    type: "sensory",
    description:
      "Profumo dedicato, musica, luce e materiali che anticipano il concept già all'ingresso e lo rendono riconoscibile.",
    costLevel: "mid",
    paxMin: 30,
    paxMax: 3000,
    tags: ["accoglienza", "brand", "sensoriale"],
  },
  {
    name: "Chef's table",
    type: "food",
    description:
      "Piccoli gruppi cucinano con lo chef o assistono alla preparazione: il networking nasce naturalmente intorno al cibo.",
    costLevel: "high",
    paxMin: 8,
    paxMax: 150,
    tags: ["networking", "food", "incentive"],
  },
  {
    name: "Cena in location segreta",
    type: "narrative",
    description:
      "La destinazione della cena si scopre solo alla fine, con indizi durante la giornata; il trasferimento fa parte dello spettacolo.",
    costLevel: "high",
    paxMin: 20,
    paxMax: 400,
    tags: ["sorpresa", "gala", "transfer"],
  },
  {
    name: "Muro degli impegni",
    type: "learning",
    description:
      "Ogni partecipante lascia un impegno concreto su un muro fisico; la foto torna a ciascuno via email dopo 30 giorni.",
    costLevel: "low",
    paxMin: 20,
    paxMax: 3000,
    tags: ["follow-up", "valori", "misurazione"],
  },
  {
    name: "Speed networking guidato",
    type: "social",
    description:
      "Incontri brevi a rotazione con abbinamenti per interessi o ruoli e domande rompighiaccio coerenti con il concept.",
    costLevel: "low",
    paxMin: 20,
    paxMax: 600,
    tags: ["networking", "relazioni"],
  },
  {
    name: "Pause attive",
    type: "wellbeing",
    description:
      "Micro-sessioni di respirazione, stretching o musica dal vivo fra una sessione e l'altra per tenere alta l'attenzione.",
    costLevel: "low",
    paxMin: 10,
    paxMax: 3000,
    tags: ["benessere", "attenzione"],
  },
  {
    name: "Mostra-racconto del brand",
    type: "spatial",
    description:
      "Percorso espositivo con oggetti, archivio e storie delle persone dell'azienda, fra heritage e futuro, visitabile nelle pause.",
    costLevel: "mid",
    paxMin: 30,
    paxMax: 3000,
    tags: ["heritage", "foyer", "storytelling"],
  },
  {
    name: "Premi votati dai colleghi",
    type: "social",
    description:
      "I colleghi votano e motivano i premi; sul palco le storie le raccontano i protagonisti.",
    costLevel: "low",
    paxMin: 30,
    paxMax: 2000,
    tags: ["convention", "riconoscimento", "persone"],
  },
  {
    name: "Radio live dell'evento",
    type: "tech",
    description:
      "Uno studio radio in loco intervista speaker e partecipanti; i contenuti diventano podcast per il dopo evento.",
    costLevel: "mid",
    paxMin: 50,
    paxMax: 5000,
    tags: ["contenuti", "post evento", "podcast"],
  },
  {
    name: "Live painting",
    type: "sensory",
    description:
      "Un artista traduce in tempo reale i contenuti della plenaria in un'opera che resta all'azienda.",
    costLevel: "mid",
    paxMin: 30,
    paxMax: 3000,
    tags: ["arte", "plenaria", "ricordo"],
  },
  {
    name: "Workshop di design thinking",
    type: "learning",
    description:
      "Sessioni guidate per generare idee su sfide reali dell'azienda, con prototipi da presentare in plenaria.",
    costLevel: "mid",
    paxMin: 15,
    paxMax: 500,
    tags: ["innovazione", "breakout", "co-creazione"],
  },
];

export async function seedDefaults(db: Db) {
  await db.transaction(async (tx) => {
    await tx.insert(schema.vatRegimes).values(VAT_REGIMES).onConflictDoNothing().run();

    await tx
      .insert(schema.checklistItems)
      .values(CHECKLIST.map((item, i) => ({ ...item, position: i + 1 })))
      .onConflictDoNothing()
      .run();

    await tx
      .insert(schema.settings)
      .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
      .onConflictDoNothing()
      .run();

    const [{ n }] = await tx.select({ n: count() }).from(schema.formatIdeas).all();
    if (n === 0) {
      await tx
        .insert(schema.formatIdeas)
        .values(FORMATS.map((f) => ({ ...f, id: newId("fmt") })))
        .run();
    }

    // Piattaforme della ricerca: entrano quelle nuove, le schede già presenti (e modificate) restano come sono.
    // Per questo dall'app le piattaforme fornite si "scartano" e non si eliminano.
    await tx
      .insert(schema.platforms)
      .values(PLATFORM_SEED.map((p) => ({ ...p, id: newId("plt"), source: "research" as const, verifiedAt: PLATFORMS_VERIFIED_AT })))
      .onConflictDoNothing({ target: schema.platforms.seedKey })
      .run();
  });
}
