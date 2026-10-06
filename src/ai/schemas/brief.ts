import { z } from "zod";

// Schemi degli output AI per brief e lacune. Tutti i campi sono obbligatori: quelli
// facoltativi sono .nullable() (richiesto dal json_schema "strict" di Qwen).

export const BRIEF_FIELDS = [
  "cliente",
  "tipo_evento",
  "obiettivi",
  "pubblico",
  "partecipanti",
  "date",
  "luogo",
  "budget",
  "formato",
  "servizi_richiesti",
  "tono",
  "gara",
  "criteri_valutazione",
  "scadenze",
  "vincoli",
] as const;

export const Evidence = z.object({
  field: z.enum(BRIEF_FIELDS),
  quote: z.string().describe("Citazione testuale esatta dal documento, copiata parola per parola (max 200 caratteri)"),
  page: z.number().int().nullable().describe("Numero di pagina dal marcatore [PAGINA n], null se il testo non ha pagine"),
});

export const BriefSchema = z.object({
  summary: z.string().describe("Sintesi del brief in 3-5 frasi, in italiano"),
  client: z.object({
    name: z.string().nullable(),
    sector: z.enum(["pharma", "medtech", "finance", "automotive", "corporate", "altro"]),
    notes: z.string().nullable().describe("Cosa fa il cliente, brand, contesto"),
  }),
  eventTitle: z.string().nullable(),
  eventType: z.string().describe("Es. convention, congresso medico, kick-off, incentive, lancio prodotto, family day, cena di gala"),
  objectives: z.array(z.string()),
  keyMessages: z.array(z.string()),
  audience: z.object({
    description: z.string().nullable(),
    profiles: z.array(z.string()).describe("Es. medici specialisti, forza vendita, dealer, clienti VIP"),
    paxMin: z.number().int().nullable(),
    paxTarget: z.number().int().nullable(),
    paxMax: z.number().int().nullable(),
    international: z.boolean().nullable(),
    languages: z.array(z.string()),
  }),
  dates: z.object({
    start: z.string().nullable().describe("AAAA-MM-GG"),
    end: z.string().nullable().describe("AAAA-MM-GG"),
    durationDays: z.number().int().nullable(),
    nights: z.number().int().nullable(),
    flexibility: z.string().nullable(),
  }),
  location: z.object({
    city: z.string().nullable(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    preferences: z.string().nullable().describe("Tipo di location desiderata, vincoli logistici"),
  }),
  budget: z.object({
    totalEuro: z.number().nullable(),
    perPaxEuro: z.number().nullable(),
    vatIncluded: z.boolean().nullable(),
    notes: z.string().nullable(),
  }),
  format: z.enum(["in_presenza", "ibrido", "virtuale", "non_indicato"]),
  requiredServices: z.array(z.string()).describe("Servizi richiesti esplicitamente dal cliente"),
  tone: z.string().nullable().describe("Tono, atmosfera, linee guida di brand"),
  tender: z.object({
    isTender: z.boolean(),
    deadline: z.string().nullable(),
    questionsDeadline: z.string().nullable(),
    deliverables: z.array(z.string()).describe("Cosa va consegnato: progetto tecnico, offerta economica, presentazione..."),
    evaluationCriteria: z.array(
      z.object({ criterion: z.string(), weight: z.number().nullable().describe("Peso o punti, se indicati"), notes: z.string().nullable() }),
    ),
    submissionFormat: z.string().nullable(),
  }),
  constraints: z.array(z.string()).describe("Vincoli: compliance, sostenibilità, accessibilità, sicurezza, policy"),
  evidence: z.array(Evidence),
});

export type BriefData = z.infer<typeof BriefSchema>;

export const GAP_STATUSES = ["specified", "implied", "missing", "not_applicable"] as const;

export const GapItemSchema = z.object({
  status: z.enum(GAP_STATUSES).describe("specified = scritto nel brief; implied = deducibile con un'ipotesi; missing = manca"),
  criticality: z.enum(["blocking", "important", "optional"]).describe("blocking = senza questa informazione non si può quotare"),
  summary: z.string().describe("Cosa sappiamo, in una frase"),
  assumption: z.string().nullable().describe("Ipotesi di lavoro se implied o missing"),
  question: z.string().nullable().describe("Domanda chiara da fare al cliente se serve"),
  evidenceQuote: z.string().nullable().describe("Citazione testuale esatta dal brief, se esiste"),
  evidencePage: z.number().int().nullable(),
});

/** Uno schema con una proprietà obbligatoria per ogni voce della checklist: nessuna voce può mancare. */
export function gapAnalysisSchema(checklistKeys: string[]) {
  const items = Object.fromEntries(checklistKeys.map((k) => [k, GapItemSchema]));
  return z.object({
    items: z.object(items),
    readiness: z.string().describe("Valutazione sintetica: quanto il brief è pronto per progettare e quotare"),
    clientEmail: z.object({
      subject: z.string(),
      body: z.string().describe("Email cordiale e professionale con le domande raggruppate per tema, in italiano"),
    }),
  });
}

export type GapItemData = z.infer<typeof GapItemSchema>;
