import { z } from "zod";

// Schemi della parte creativa. I riferimenti a format e proposte passate sono enum dinamici:
// il modello può citare solo ID che esistono davvero nell'archivio.

export const INNOVATION_TYPES = ["format", "sensory", "spatial", "narrative", "food", "social", "tech", "wellbeing", "learning"] as const;

const refEnum = (ids: string[]) => (ids.length ? z.enum(ids as [string, ...string[]]) : z.string());

export function conceptSchema(formatIds: string[], workIds: string[]) {
  return z.object({
    name: z.string().describe("Nome del concept: breve, evocativo, memorabile"),
    claim: z.string().describe("Claim dell'evento"),
    insight: z.string().describe("L'intuizione sul pubblico o sul cliente da cui nasce l'idea"),
    bigIdea: z.string().describe("L'idea in 2-3 frasi"),
    narrative: z.string().describe("Come si sviluppa il racconto: dall'invito al dopo evento"),
    wowMoment: z.object({
      title: z.string(),
      description: z.string().describe("Cosa vivono le persone, concretamente"),
      when: z.string().describe("In quale momento dell'evento"),
      whyItWorks: z.string(),
      feasibility: z.string().describe("Cosa serve per realizzarlo: fornitori, tempi, vincoli tecnici"),
    }),
    experienceHighlights: z.array(z.string()).describe("3-5 momenti chiave dell'esperienza"),
    innovationTypes: z.array(z.enum(INNOVATION_TYPES)),
    formatIds: z.array(refEnum(formatIds)).describe("ID dei format della libreria usati"),
    referenceWorkIds: z.array(refEnum(workIds)).describe("ID delle proposte passate a cui si ispira, solo se pertinenti"),
    venueDirection: z.string().describe("Che tipo di location serve e perché"),
    lookAndFeel: z.string().describe("Direzione visiva in parole: atmosfera, materiali, colori, luce"),
    budgetImpact: z.enum(["low", "mid", "high"]),
    risks: z.array(z.string()),
    whyItWins: z.string().describe("Perché convince il cliente o la commissione di gara"),
  });
}

export type ConceptData = z.infer<ReturnType<typeof conceptSchema>>;

export function conceptsResponseSchema(formatIds: string[], workIds: string[]) {
  const c = conceptSchema(formatIds, workIds);
  return z.object({ safe: c, bold: c, disruptive: c });
}

export const DEFAULT_RUBRIC = [
  { criterion: "Aderenza agli obiettivi del brief", weight: 20 },
  { criterion: "Originalità rispetto al consuetudinario", weight: 20 },
  { criterion: "Coerenza del racconto", weight: 15 },
  { criterion: "Impatto sul pubblico (effetto wow)", weight: 15 },
  { criterion: "Fattibilità e rischi", weight: 15 },
  { criterion: "Sostenibilità del budget", weight: 10 },
  { criterion: "Compliance di settore", weight: 5 },
];

export function critiqueSchema(criteria: string[]) {
  const evaluation = z.object({
    scores: z.array(
      z.object({
        criterion: z.enum(criteria as [string, ...string[]]),
        score: z.number().int().describe("Da 1 a 10"),
        reason: z.string(),
      }),
    ),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    fixes: z.array(z.string()).describe("Come migliorarlo prima di presentarlo"),
  });
  return z.object({
    A: evaluation,
    B: evaluation,
    C: evaluation,
    comparison: z.string().describe("Confronto fra le tre proposte"),
    tooSimilar: z.boolean().describe("true se due proposte sono troppo simili fra loro"),
    recommendation: z.string(),
  });
}

export const BibleSchema = z.object({
  name: z.string(),
  claim: z.string(),
  tone: z.string().describe("Tono di voce in una frase"),
  toneWords: z.array(z.string()).describe("4-6 parole chiave del tono"),
  narrativeArc: z.array(z.object({ phase: z.string(), description: z.string() })).describe("Dall'invito al dopo evento"),
  keyMessages: z.array(z.string()),
  wowMoment: z.object({ title: z.string(), description: z.string(), when: z.string() }),
  palette: z
    .array(z.object({ name: z.string(), hex: z.string().describe("#RRGGBB"), role: z.string().describe("primario, accento, fondo…") }))
    .describe("4-6 colori"),
  typography: z.object({
    display: z.string().describe("Font per titoli, possibilmente Google Fonts"),
    text: z.string().describe("Font per testi"),
    notes: z.string(),
  }),
  keyVisual: z.object({
    description: z.string(),
    imagePrompt: z.string().describe("Prompt dettagliato per generare il key visual, senza testo nell'immagine"),
  }),
  moodboardPrompts: z.array(z.string()).describe("3-4 prompt per immagini di moodboard (atmosfera, materiali, luce, persone)"),
  applications: z.array(z.string()).describe("Invito, badge, palco, segnaletica, social, gadget…"),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
});

export type BibleData = z.infer<typeof BibleSchema>;
