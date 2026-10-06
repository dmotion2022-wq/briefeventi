import { parse } from "csv-parse/sync";
import { parseItalianAmount } from "@/lib/money";

// Pulizia delle righe del foglio "Executive Summary" (cartella Drive MVP SUPPLIERS).
// Funzioni pure, testate su righe costruite con lo stesso formato del foglio.

export type SheetRow = Record<string, string>;

export const parseCsv = (text: string): string[][] =>
  parse(text, { relax_column_count: true, skip_empty_lines: false, bom: true }) as string[][];

const EMPTY_VALUES = new Set(["", "nc", "na", "n/a", "n.a.", "nd", "n.d.", "-", "—", "–", "?"]);

export function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.replace(/\s+/g, " ").trim();
  return EMPTY_VALUES.has(v.toLowerCase()) ? null : v;
}

const normHeader = (h: string) => h.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Trasforma la griglia in record usando la prima riga che contiene l'intestazione attesa.
 * Salta righe vuote, intestazioni ripetute e righe descrittive (quelle che spiegano le colonne).
 */
export function toRecords(grid: string[][], idHeaderPrefix = "id / nome"): SheetRow[] {
  const headerIdx = grid.findIndex((row) => row.some((c) => normHeader(c).startsWith(idHeaderPrefix)));
  if (headerIdx === -1) return [];
  const headers = grid[headerIdx].map((h) => h.replace(/\s+/g, " ").trim());
  const headerKey = headers.map(normHeader).join("|");
  const idCol = headers.findIndex((h) => normHeader(h).startsWith(idHeaderPrefix));
  const linkCol = headers.findIndex((h) => normHeader(h).startsWith("link"));

  const records: SheetRow[] = [];
  for (const row of grid.slice(headerIdx + 1)) {
    if (!row.some((c) => c.trim())) continue;
    if (row.map(normHeader).join("|") === headerKey) continue; // intestazione duplicata
    const id = row[idCol]?.trim() ?? "";
    if (!id) continue;
    const link = linkCol >= 0 ? (row[linkCol] ?? "").trim() : "";
    const looksLikeFile = /\.(pdf|pptx?|docx?|xlsx?|key|zip)\b/i.test(id);
    const looksLikeLink = /https?:\/\//i.test(link);
    if (!looksLikeFile && !looksLikeLink) continue; // riga di descrizione delle colonne
    const record: SheetRow = {};
    headers.forEach((h, i) => {
      if (h) record[h] = (row[i] ?? "").trim();
    });
    records.push(record);
  }
  return records;
}

/** Legge una colonna cercandola per prefisso dell'intestazione (le intestazioni hanno varianti). */
export function col(record: SheetRow, ...prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    const key = Object.keys(record).find((k) => normHeader(k).startsWith(prefix.toLowerCase()));
    if (key) return clean(record[key]);
  }
  return null;
}

export function driveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([A-Za-z0-9_-]{15,})/) ?? url.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
  return m ? m[1] : null;
}

export const sourceKeyFor = (fileName: string) => fileName.trim().replace(/\s+/g, " ").toLowerCase();

/** Nome leggibile ricavato dal nome del file: "___MUDEC Media Kit _ 2024.pdf" → "MUDEC Media Kit 2024". */
export function displayNameFromFile(fileName: string) {
  return fileName
    .replace(/\.(pdf|pptx?|docx?|xlsx?|key)$/i, "")
    .replace(/[_+]+/g, " ")
    .replace(/\s+-\s+/g, " – ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s–-]+|[\s–-]+$/g, "")
    .trim();
}

const numbersIn = (text: string) =>
  [...text.replace(/(\d)\.(\d{3})/g, "$1$2").matchAll(/\d+/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n > 0 && n < 100_000 && !(n >= 1900 && n <= 2100));

/** "80–120" → 80/120 · "~650" → 650/650 · "fino a 80 pax" → null/80. */
export function parsePaxRange(text: string | null): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };
  const nums = numbersIn(text.split("(")[0].trim() || text);
  if (nums.length === 0) return { min: null, max: null };
  const max = Math.max(...nums);
  if (/fino a|max|massimo/i.test(text)) return { min: null, max };
  return { min: Math.min(...nums), max };
}

/** "4 – motivo" / "4 — motivo" / "3" → punteggio 1-5 e motivo. */
export function parseFit(text: string | null): { score: number | null; reason: string | null } {
  if (!text) return { score: null, reason: null };
  const m = text.match(/^\s*([1-5])\s*(?:[-–—:/]\s*)?([\s\S]*)$/);
  if (!m) return { score: null, reason: text };
  return { score: Number(m[1]), reason: clean(m[2]) };
}

export function parseTags(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** "Sì — 146 camere" → 146 · "Sì" → null (camere presenti ma non contate). */
export function parseRooms(text: string | null): { hasRooms: boolean | null; rooms: number | null } {
  if (!text) return { hasRooms: null, rooms: null };
  const has = /^s[iì]/i.test(text) ? true : /^no/i.test(text) ? false : null;
  const m = text.match(/(\d+)\s*camer/i);
  return { hasRooms: has ?? (m ? true : null), rooms: m ? Number(m[1]) : null };
}

/** Capienza massima solo se c'è un numero esplicito ("120 capienza", "fino a 350 pax"). */
export function parseCapacity(text: string | null): number | null {
  if (!text) return null;
  const nums = numbersIn(text);
  return nums.length ? Math.max(...nums) : null;
}

/** "IT — Lombardia" → IT/Lombardia · "PT" → PT/null. */
export function parseCountryRegion(text: string | null): { country: string | null; region: string | null } {
  if (!text) return { country: null, region: null };
  const m = text.match(/^([A-Z]{2})\b\s*(?:[—–-]\s*(.+))?$/);
  if (m) return { country: m[1], region: m[2]?.trim() ?? null };
  return { country: null, region: text };
}

export type PricingModel = "unit" | "per_pax" | "forfait" | "package" | "percent";

export function mapPricingModel(label: string | null): { model: PricingModel; periodUnit: "none" | "hour" | "day" | "night" } {
  const l = (label ?? "").toLowerCase();
  if (l.includes("pacchetto") || l.includes("fino a")) return { model: "package", periodUnit: "none" };
  if (l.includes("forfait") || l.includes("a corpo") || l.includes("a preventivo")) return { model: "forfait", periodUnit: "none" };
  if (l.includes("ora")) return { model: "unit", periodUnit: "hour" };
  if (l.includes("giorn")) return { model: "unit", periodUnit: "day" };
  if (l.includes("nott")) return { model: "unit", periodUnit: "night" };
  if (l.includes("pax") || l.includes("persona") || l.includes("partecipante")) return { model: "per_pax", periodUnit: "none" };
  return { model: "unit", periodUnit: "none" };
}

export function parseVatIncluded(...texts: (string | null)[]): "yes" | "no" | "unknown" {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (/verificare iva|iva da verificare/.test(t)) return "unknown";
  if (/iva inclusa|ivato|iva compresa/.test(t)) return "yes";
  if (/iva esclusa|\+\s*iva|oltre iva|esclusa iva/.test(t)) return "no";
  return "unknown";
}

export const amount = (text: string | null) => (text ? parseItalianAmount(text) : null);

/** Quantità inclusa nel pacchetto: "fino a 80 pax" → 80. */
export function parseIncludedQuantity(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
