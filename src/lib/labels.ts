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
