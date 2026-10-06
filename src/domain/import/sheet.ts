import type { SupplierKind } from "./types";
import {
  amount,
  col,
  displayNameFromFile,
  driveFileId,
  mapPricingModel,
  parseCapacity,
  parseCountryRegion,
  parseFit,
  parseIncludedQuantity,
  parsePaxRange,
  parseRooms,
  parseTags,
  parseVatIncluded,
  sourceKeyFor,
  type PricingModel,
  type SheetRow,
} from "./normalize";

// Mappatura dei tre fogli dell'Executive Summary sui record dell'archivio.

export type WorkRecord = {
  sourceKey: string;
  name: string;
  driveFileId: string | null;
  eventType: string | null;
  paxText: string | null;
  paxMin: number | null;
  paxMax: number | null;
  durationText: string | null;
  area: string | null;
  concept: string | null;
  tags: string[];
  engagement: string | null;
  overnight: string | null;
  budgetText: string | null;
  fitScore: number | null;
  fitReason: string | null;
  raw: SheetRow;
};

export function mapWork(r: SheetRow): WorkRecord {
  const file = col(r, "id / nome")!;
  const pax = col(r, "n. persone", "n persone", "pax");
  const range = parsePaxRange(pax);
  const fit = parseFit(col(r, "fit"));
  return {
    sourceKey: sourceKeyFor(file),
    name: file,
    driveFileId: driveFileId(col(r, "link")),
    eventType: col(r, "tipo evento"),
    paxText: pax,
    paxMin: range.min,
    paxMax: range.max,
    durationText: col(r, "durata"),
    area: col(r, "area"),
    concept: col(r, "concept"),
    tags: parseTags(col(r, "3 tag", "tag")),
    engagement: col(r, "punti di engagement", "engagement"),
    overnight: col(r, "pernotto"),
    budgetText: col(r, "budget"),
    fitScore: fit.score,
    fitReason: fit.reason,
    raw: r,
  };
}

export type VenueRecord = {
  sourceKey: string;
  name: string;
  driveFileId: string | null;
  assetType: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  locationType: string | null;
  capacityMax: number | null;
  capacityText: string | null;
  usp: string | null;
  constraints: string | null;
  rooms: number | null;
  roomsText: string | null;
  budgetLevel: string | null;
  tags: string[];
  bestFor: string | null;
  fitScore: number | null;
  fitReason: string | null;
  supplierKind: SupplierKind;
  raw: SheetRow;
};

function venueSupplierKind(assetType: string | null, locationType: string | null): SupplierKind {
  const t = `${assetType ?? ""} ${locationType ?? ""}`.toLowerCase();
  if (t.includes("dmc") || t.includes("destination")) return "dmc";
  if (t.includes("hotel") || t.includes("resort")) return "hotel";
  return "venue";
}

export function mapVenue(r: SheetRow): VenueRecord {
  const file = col(r, "id / nome")!;
  const capacityText = col(r, "capienza");
  const roomsText = col(r, "pernotto", "camere");
  const where = parseCountryRegion(col(r, "paese"));
  const fit = parseFit(col(r, "fit"));
  const assetType = col(r, "tipo asset");
  const locationType = col(r, "tipologia location", "tipologia");
  return {
    sourceKey: sourceKeyFor(file),
    name: displayNameFromFile(file),
    driveFileId: driveFileId(col(r, "link")),
    assetType,
    city: col(r, "città", "citta"),
    region: where.region,
    country: where.country,
    locationType,
    capacityMax: parseCapacity(capacityText),
    capacityText,
    usp: col(r, "spazi chiave", "usp"),
    constraints: col(r, "vincoli"),
    rooms: parseRooms(roomsText).rooms,
    roomsText,
    budgetLevel: col(r, "budget"),
    tags: parseTags(col(r, "tag")),
    bestFor: col(r, "best for"),
    fitScore: fit.score,
    fitReason: fit.reason,
    supplierKind: venueSupplierKind(assetType, locationType),
    raw: r,
  };
}

export type BenchmarkRecord = {
  sourceKey: string;
  fileName: string;
  driveFileId: string | null;
  supplierName: string | null;
  supplierKind: SupplierKind;
  category: string;
  city: string | null;
  useCase: string | null;
  paxRef: number | null;
  observedAt: string | null;
  pricingModel: PricingModel;
  pricingModelLabel: string | null;
  periodUnit: "none" | "hour" | "day" | "night";
  unit: string | null;
  includedQuantity: number | null;
  unitCostCents: number | null;
  fixedCostCents: number | null;
  totalCents: number | null;
  vatIncluded: "yes" | "no" | "unknown";
  included: string | null;
  excluded: string | null;
  raw: SheetRow;
};

function categoryKind(category: string): SupplierKind {
  const c = category.toLowerCase();
  if (c.includes("service") || c.includes("audio") || c.includes("video") || c.includes("tecnic")) return "av";
  if (c.includes("transfer") || c.includes("trasport")) return "transport";
  if (c.includes("staff") || c.includes("hostess") || c.includes("guid")) return "staff";
  if (c.includes("catering") || c.includes("f&b") || c.includes("food")) return "catering";
  if (c.includes("noleggio") || c.includes("allest") || c.includes("arred")) return "staging";
  if (c.includes("location") || c.includes("venue") || c.includes("affitto")) return "venue";
  if (c.includes("hotel")) return "hotel";
  return "other";
}

/** Nomi fornitore che non identificano un'azienda (testo generico o righe sporche). */
export function isUsableSupplierName(name: string | null): name is string {
  if (!name) return false;
  const n = name.toLowerCase();
  return !(n.includes("nel pdf") || n.startsWith("giorno") || n.length < 3 || /^\d/.test(n));
}

export function mapBenchmark(r: SheetRow): BenchmarkRecord {
  const file = col(r, "id / nome")!;
  const pricingLabel = col(r, "pricing model", "modello");
  const pricing = mapPricingModel(pricingLabel);
  const category = col(r, "categoria costo", "categoria") ?? "altro";
  const supplierName = col(r, "fornitore");
  const excluded = col(r, "escluso", "note");
  const included = col(r, "incluso");
  const paxRef = parsePaxRange(col(r, "pax di riferimento", "pax")).max;
  const unitCost = amount(col(r, "costo unitario"));
  const fixedCost = amount(col(r, "costo fisso", "forfait"));
  const total = amount(col(r, "totale"));
  return {
    sourceKey: sourceKeyFor(file),
    fileName: file,
    driveFileId: driveFileId(col(r, "link")),
    supplierName: isUsableSupplierName(supplierName) ? supplierName : null,
    supplierKind: categoryKind(category),
    category,
    city: col(r, "città", "citta"),
    useCase: col(r, "tipo evento", "use case"),
    paxRef,
    observedAt: col(r, "periodo", "data"),
    pricingModel: pricing.model,
    pricingModelLabel: pricingLabel,
    periodUnit: pricing.periodUnit,
    unit: col(r, "unità di misura", "unita di misura", "unità"),
    includedQuantity: parseIncludedQuantity(col(r, "quantità inclusa", "quantita inclusa", "soglia")),
    unitCostCents: unitCost,
    fixedCostCents: fixedCost,
    totalCents: total,
    vatIncluded: parseVatIncluded(excluded, included),
    included,
    excluded,
    raw: r,
  };
}
