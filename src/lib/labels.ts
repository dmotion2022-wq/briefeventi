// Etichette italiane per le enumerazioni del database.
import type { Tone } from "@/components/ui/badge";

export const SECTOR_LABELS: Record<string, string> = {
  pharma: "Pharma",
  medtech: "Medtech",
  finance: "Finance",
  automotive: "Automotive",
  corporate: "Corporate",
  altro: "Altro",
};

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  brief: { label: "Brief", tone: "neutral" },
  analisi: { label: "Analisi", tone: "violet" },
  concept: { label: "Concept", tone: "magenta" },
  sviluppo: { label: "Sviluppo", tone: "amber" },
  preventivo: { label: "Preventivo", tone: "amber" },
  inviata: { label: "Inviata", tone: "violet" },
  vinta: { label: "Vinta", tone: "ok" },
  persa: { label: "Persa", tone: "warn" },
  archiviata: { label: "Archiviata", tone: "neutral" },
};

export const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "In coda", tone: "neutral" },
  running: { label: "In corso", tone: "violet" },
  done: { label: "Completato", tone: "ok" },
  failed: { label: "Errore", tone: "warn" },
  cancelled: { label: "Annullato", tone: "neutral" },
  interrupted: { label: "Interrotto", tone: "amber" },
};

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)) : "—";

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
        new Date(iso),
      )
    : "—";

export const SUPPLIER_KIND_LABELS: Record<string, string> = {
  venue: "Location",
  hotel: "Hotel",
  dmc: "DMC",
  catering: "Catering",
  av: "Audio, video, luci",
  staging: "Allestimenti e noleggi",
  transport: "Trasporti",
  staff: "Staff",
  entertainment: "Intrattenimento",
  print: "Stampa",
  gadget: "Gadget",
  experience: "Esperienze",
  other: "Altro",
};

export const CONTACT_STATUS: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Verificato", tone: "ok" },
  to_verify: { label: "Da verificare", tone: "amber" },
  invalid: { label: "Non valido", tone: "warn" },
};

export const VERIFICATION_METHOD: Record<string, string> = {
  pdf_text: "trovato nel PDF",
  page_fetch: "trovato sul sito",
  manual_call: "confermato al telefono",
  manual_entry: "inserito a mano",
};

export const PRICING_MODEL_LABELS: Record<string, string> = {
  unit: "a unità",
  per_pax: "a persona",
  forfait: "forfait",
  package: "pacchetto fino a N",
  percent: "percentuale",
};

export const FORMAT_TYPE_LABELS: Record<string, string> = {
  format: "Formato",
  sensory: "Sensoriale",
  spatial: "Spazio",
  narrative: "Narrazione",
  food: "Food",
  social: "Sociale",
  tech: "Tecnologia",
  wellbeing: "Benessere",
  learning: "Apprendimento",
};

export const COST_LEVEL_LABELS: Record<string, string> = { low: "€", mid: "€€", high: "€€€" };

// Categorie delle piattaforme: le chiavi della checklist più "dmc" e "generale".
export const PLATFORM_CATEGORY_LABELS: Record<string, string> = {
  generale: "Trasversali: convention bureau, associazioni, elenchi",
  location: "Location e sale",
  pernottamento: "Hotel e pernottamento",
  dmc: "DMC e servizi in destinazione",
  catering: "Catering e F&B",
  allestimenti: "Allestimenti, arredi e noleggi",
  av_regia: "Audio, video, luci e regia",
  transfer: "Viaggi e transfer",
  staff: "Staff, interpreti, foto e video",
  registrazione: "Iscrizioni, ticketing e app",
  engagement: "Interazione ed engagement",
  comunicazione: "Stampa e comunicazione",
  gadget: "Gadget e welcome kit",
  intrattenimento: "Intrattenimento, speaker e team building",
  sicurezza_permessi: "Sicurezza, sanità, permessi e assicurazioni",
  siae: "SIAE e diritti musicali",
  sostenibilita: "Sostenibilità",
  ecm: "Accreditamento ECM",
};

/** Categoria delle piattaforme per una voce di costo (chiave della checklist). */
export const platformCategoryFor = (category: string | null | undefined) =>
  !category ? "generale" : category === "sale_allestimento" ? "location" : category in PLATFORM_CATEGORY_LABELS ? category : "generale";

export const PLATFORM_TYPE_LABELS: Record<string, string> = {
  marketplace: "Marketplace",
  directory: "Elenco",
  associazione: "Associazione",
  convention_bureau: "Convention bureau",
  software: "Software",
  portale_ufficiale: "Portale ufficiale",
  fornitore_nazionale: "Fornitore nazionale",
};

export const PLATFORM_STATUS: Record<string, { label: string; tone: Tone }> = {
  in_uso: { label: "In uso", tone: "ok" },
  da_valutare: { label: "Da valutare", tone: "neutral" },
  scartata: { label: "Scartata", tone: "warn" },
};

/** URL di ricerca della piattaforma con testo e città, se la piattaforma lo permette. */
export function platformSearchLink(template: string | null | undefined, q: string, city?: string | null) {
  if (!template) return null;
  if (template.includes("{city}") && !city?.trim()) return null;
  return template.replaceAll("{q}", encodeURIComponent(q.trim())).replaceAll("{city}", encodeURIComponent(city?.trim() ?? ""));
}
