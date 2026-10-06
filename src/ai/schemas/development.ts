import { z } from "zod";
import { PERIOD_UNITS, PRICING_MODELS, SLOT_KINDS, SUPPLIER_KINDS } from "@/db/schema";

// Scaletta e moduli. Gli ID degli slot e dell'archivio sono enum dinamici: un modulo
// non può agganciarsi a uno slot che non esiste o citare una location inventata.

const enumOrString = (ids: string[]) => (ids.length ? z.enum(ids as [string, ...string[]]) : z.string());

export function agendaSchema(existingSlotIds: string[]) {
  return z.object({
    days: z.array(z.object({ day: z.number().int(), date: z.string().nullable().describe("AAAA-MM-GG"), theme: z.string() })),
    slots: z.array(
      z.object({
        keepId: enumOrString(existingSlotIds).nullable().describe("ID dello slot esistente da mantenere; null per uno nuovo"),
        day: z.number().int(),
        start: z.string().describe("HH:MM"),
        end: z.string().describe("HH:MM"),
        kind: z.enum(SLOT_KINDS),
        title: z.string(),
        description: z.string(),
        room: z.string().nullable(),
        pax: z.number().int().nullable(),
        narrativeBeat: z.string().nullable().describe("Fase dell'arco narrativo della concept bible"),
      }),
    ),
    notes: z.string(),
  });
}

export function componentSchema(slotIds: string[], categories: string[]) {
  return z.object({
    category: enumOrString(categories).describe("Voce della checklist a cui appartiene"),
    title: z.string().describe("Nome della voce di costo, come andrà in preventivo"),
    description: z.string().describe("Specifiche per il fornitore: cosa, quanti, quando"),
    slotIds: z.array(enumOrString(slotIds)),
    quantity: z.number(),
    unit: z.string().describe("pax, camere, ore, pezzi, giorni…"),
    periods: z.number().describe("Giorni, notti o ore di servizio; 1 se non serve"),
    periodUnit: z.enum(PERIOD_UNITS),
    pricingModel: z.enum(PRICING_MODELS),
    optional: z.boolean(),
    supplierKind: z.enum(SUPPLIER_KINDS),
    estimate: z.object({
      unitCostEuro: z.number().nullable().describe("Costo unitario netto IVA per i modelli a unità/persona"),
      fixedCostEuro: z.number().nullable().describe("Costo a corpo netto IVA per forfait e pacchetti"),
      minEuro: z.number().describe("Costo totale minimo plausibile"),
      maxEuro: z.number().describe("Costo totale massimo plausibile"),
      basis: z.string().describe("Da dove viene la stima: voce di listino, prezzi di mercato, ipotesi"),
    }),
  });
}

export type ComponentData = z.infer<ReturnType<typeof componentSchema>>;

export function moduleSchemas(ids: { slots: string[]; categories: string[]; venues: string[]; formats: string[] }) {
  const components = z.array(componentSchema(ids.slots, ids.categories));
  const slotRefs = z.array(enumOrString(ids.slots));
  const venueRef = enumOrString(ids.venues).nullable().describe("ID della scheda in archivio, null se non c'è");
  const mechanic = z.object({
    name: z.string(),
    description: z.string(),
    slotIds: slotRefs,
    formatId: enumOrString(ids.formats).nullable(),
    analog: z.boolean().describe("true se non richiede tecnologia"),
    why: z.string(),
  });
  return {
    venue: z.object({
      summary: z.string(),
      requirements: z.object({
        plenary: z.object({ setup: z.string(), pax: z.number().int() }),
        breakouts: z.array(z.object({ count: z.number().int(), pax: z.number().int(), setup: z.string() })),
        otherSpaces: z.array(z.string()),
        technical: z.array(z.string()).describe("Altezze, carichi, rigging, prese, connettività…"),
        accessibility: z.string(),
        logistics: z.string(),
      }),
      venueTypes: z.array(z.string()),
      candidates: z.array(z.object({ venueId: venueRef, name: z.string(), city: z.string().nullable(), why: z.string(), watchouts: z.string() })),
      roomPlan: z.array(z.object({ slotIds: slotRefs, space: z.string(), setup: z.string(), pax: z.number().int() })),
      components,
    }),
    accommodation: z.object({
      needed: z.boolean(),
      summary: z.string(),
      nights: z.array(z.object({ date: z.string().nullable(), singles: z.number().int(), doubles: z.number().int() })),
      category: z.string(),
      location: z.string(),
      candidates: z.array(z.object({ venueId: venueRef, name: z.string(), why: z.string() })),
      rules: z.array(z.string()),
      components,
    }),
    catering: z.object({
      foodConcept: z.string().describe("Come il cibo racconta il concept"),
      services: z.array(
        z.object({
          slotId: enumOrString(ids.slots),
          service: z.string(),
          formula: z.string().describe("Standing, seduto, family style, show cooking…"),
          menuIdea: z.string(),
          pax: z.number().int(),
          dietary: z.string(),
          setting: z.string(),
        }),
      ),
      sustainability: z.array(z.string()),
      components,
    }),
    graphic: z.object({
      identitySummary: z.string(),
      applications: z.array(z.object({ name: z.string(), description: z.string(), format: z.string() })),
      signage: z.array(z.string()),
      digital: z.array(z.string()),
      imagePrompts: z.array(
        z.object({
          purpose: z.enum(["key_visual", "moodboard", "application"]),
          title: z.string(),
          prompt: z.string().describe("Prompt dettagliato in inglese o italiano, senza testo nell'immagine"),
          size: z.enum(["1664*928", "1328*1328", "928*1664"]),
        }),
      ),
      components,
    }),
    engagement: z.object({
      summary: z.string(),
      before: z.array(mechanic),
      during: z.array(mechanic),
      after: z.array(mechanic),
      measurement: z.object({ kpis: z.array(z.object({ name: z.string(), how: z.string(), target: z.string() })) }),
      components,
    }),
    production: z.object({
      av: z.array(z.string()),
      staging: z.array(z.string()),
      staff: z.array(z.object({ role: z.string(), count: z.number().int(), when: z.string() })),
      transport: z.array(z.object({ what: z.string(), pax: z.number().int(), when: z.string() })),
      safety: z.array(z.string()),
      permits: z.array(z.string()),
      siaeNeeded: z.boolean(),
      siaeNotes: z.string().nullable(),
      sustainability: z.array(z.string()),
      components,
    }),
  };
}

export type ModuleKind = keyof ReturnType<typeof moduleSchemas>;
type ModuleSchemas = ReturnType<typeof moduleSchemas>;
/** Dati salvati di ciascun modulo (i componenti stanno nella loro tabella). */
export type ModuleData = { [K in ModuleKind]: Omit<z.infer<ModuleSchemas[K]>, "components"> };
export const MODULE_ORDER: ModuleKind[] = ["venue", "accommodation", "catering", "graphic", "engagement", "production"];

export const MODULE_BRIEFS: Record<ModuleKind, string> = {
  venue:
    "LOCATION E SALE: requisiti degli spazi (plenaria, breakout, foyer, spazi speciali per il momento wow), tipologie di location coerenti col concept, candidati dall'archivio quando adatti (solo ID esistenti), piano sale per slot.",
  accommodation:
    "PERNOTTAMENTO: se serve, notti e camere (singole/DUS e doppie) coerenti con date e partecipanti, categoria e posizione, candidati dall'archivio, regole di settore sull'ospitalità.",
  catering:
    "CATERING: un servizio per ogni slot di coffee break, pranzo, cena o gala della scaletta (usa gli ID degli slot), formula, idea di menu coerente col concept, diete e allergie, sostenibilità.",
  graphic:
    "CONCEPT GRAFICO: declinazioni dell'identità (inviti, badge, palco, ledwall, segnaletica, digitale, gadget) e prompt per le immagini (key visual, moodboard, applicazioni), coerenti con palette e tono della bible.",
  engagement:
    "INTERAZIONE: meccaniche prima, durante e dopo l'evento agganciate agli slot, anche analogiche, con i format della libreria quando adatti; piano di misurazione con KPI chiari (è il DNA di Factory Studios).",
  production:
    "PRODUZIONE E SERVIZI: audio/video/luci e regia, allestimenti, staff, transfer, sicurezza e permessi, SIAE se c'è musica, sostenibilità.",
};
