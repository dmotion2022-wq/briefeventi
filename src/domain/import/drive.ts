import { eq } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db/client";
import { newId } from "@/lib/ids";
import type { DriveSource } from "@/lib/settings-defaults";
import { parseCsv, toRecords } from "./normalize";
import { mapBenchmark, mapVenue, mapWork, type BenchmarkRecord, type VenueRecord, type WorkRecord } from "./sheet";
import type { SupplierKind } from "./types";

// Import dell'indice "Executive Summary" (cartella Drive MVP SUPPLIERS).
// Prima la prova a vuoto (differenze), poi l'applicazione: idempotente per sourceKey.

export const sheetCsvUrl = (sheetId: string, gid: string) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

export async function fetchSheetCsv(sheetId: string, gid: string, signal?: AbortSignal) {
  const res = await fetch(sheetCsvUrl(sheetId, gid), { redirect: "follow", signal });
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!res.ok || type.includes("text/html")) {
    throw new Error(
      `Foglio non leggibile (HTTP ${res.status}). Se la cartella non è più condivisa con link, esporta il foglio in CSV e caricalo a mano.`,
    );
  }
  return text;
}

export type ImportPlan = { works: WorkRecord[]; venues: VenueRecord[]; benchmarks: BenchmarkRecord[] };

export function buildPlan(csv: { works?: string; location?: string; budgets?: string }): ImportPlan {
  return {
    works: csv.works ? toRecords(parseCsv(csv.works)).map(mapWork) : [],
    venues: csv.location ? toRecords(parseCsv(csv.location)).map(mapVenue) : [],
    benchmarks: csv.budgets ? toRecords(parseCsv(csv.budgets)).map(mapBenchmark) : [],
  };
}

export async function fetchPlan(source: DriveSource, signal?: AbortSignal): Promise<ImportPlan> {
  const [works, location, budgets] = await Promise.all([
    fetchSheetCsv(source.sheetId, source.gids.works, signal),
    fetchSheetCsv(source.sheetId, source.gids.location, signal),
    fetchSheetCsv(source.sheetId, source.gids.budgets, signal),
  ]);
  return buildPlan({ works, location, budgets });
}

export type DiffCounts = { added: string[]; changed: string[]; unchanged: number };
export type ImportDiff = { works: DiffCounts; venues: DiffCounts; benchmarks: DiffCounts };

const stable = (o: unknown) => JSON.stringify(o, Object.keys(o as object).sort());

function diffRaw(existing: Map<string, Record<string, string> | null>, incoming: { sourceKey: string; raw: Record<string, string> }[], label: (r: { sourceKey: string }) => string): DiffCounts {
  const out: DiffCounts = { added: [], changed: [], unchanged: 0 };
  for (const rec of incoming) {
    if (!existing.has(rec.sourceKey)) out.added.push(label(rec));
    else if (stable(existing.get(rec.sourceKey) ?? {}) !== stable(rec.raw)) out.changed.push(label(rec));
    else out.unchanged++;
  }
  return out;
}

/** Prova a vuoto: cosa verrebbe aggiunto o aggiornato, senza scrivere nulla. */
export async function diffPlan(plan: ImportPlan): Promise<ImportDiff> {
  const db = getDb();
  const works = new Map(
    (await db.select({ k: schema.referenceWorks.sourceKey, raw: schema.referenceWorks.raw }).from(schema.referenceWorks).all()).map((r) => [r.k, r.raw]),
  );
  const venues = new Map((await db.select({ k: schema.venues.sourceKey, raw: schema.venues.raw }).from(schema.venues).all()).map((r) => [r.k, r.raw]));
  const benchmarks = new Map(
    (await db.select({ k: schema.priceBenchmarks.sourceKey, raw: schema.priceBenchmarks.raw }).from(schema.priceBenchmarks).all()).map((r) => [r.k ?? "", r.raw]),
  );
  return {
    works: diffRaw(works, plan.works, (r) => (r as WorkRecord).name),
    venues: diffRaw(venues, plan.venues, (r) => (r as VenueRecord).name),
    benchmarks: diffRaw(benchmarks, plan.benchmarks, (r) => (r as BenchmarkRecord).fileName),
  };
}

const supplierKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|srls|snc|sas)\b/g, "")
    .replace(/[^a-z0-9àèéìòù]+/g, " ")
    .trim();

/** Trova o crea il fornitore (deduplica per nome normalizzato). */
async function upsertSupplier(
  tx: Tx,
  index: Map<string, string>,
  data: { name: string; kind: SupplierKind; city?: string | null; region?: string | null; country?: string | null; categories?: string[] },
) {
  const key = supplierKey(data.name);
  const existing = index.get(key);
  if (existing) return existing;
  const id = newId("sup");
  await tx
    .insert(schema.suppliers)
    .values({
      id,
      name: data.name,
      kind: data.kind,
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country ?? null,
      categories: data.categories ?? [],
      source: "sheet",
    })
    .run();
  index.set(key, id);
  return id;
}

export async function applyPlan(plan: ImportPlan) {
  const db = getDb();
  const diff = await diffPlan(plan);
  await db.transaction(async (tx) => {
    const supplierIndex = new Map(
      (await tx.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).all()).map((s) => [supplierKey(s.name), s.id]),
    );

    for (const w of plan.works) {
      const values = { ...w, tags: w.tags };
      await tx
        .insert(schema.referenceWorks)
        .values({ id: newId("wrk"), ...values })
        .onConflictDoUpdate({ target: schema.referenceWorks.sourceKey, set: values })
        .run();
    }

    for (const v of plan.venues) {
      const { supplierKind, ...values } = v;
      const current = await tx.select({ supplierId: schema.venues.supplierId }).from(schema.venues).where(eq(schema.venues.sourceKey, v.sourceKey)).get();
      const supplierId =
        current?.supplierId ??
        (await upsertSupplier(tx, supplierIndex, { name: v.name, kind: supplierKind, city: v.city, region: v.region, country: v.country, categories: ["location"] }));
      await tx
        .insert(schema.venues)
        .values({ id: newId("ven"), ...values, supplierId })
        .onConflictDoUpdate({ target: schema.venues.sourceKey, set: { ...values, supplierId } })
        .run();
    }

    for (const b of plan.benchmarks) {
      const supplierId = b.supplierName
        ? await upsertSupplier(tx, supplierIndex, { name: b.supplierName, kind: b.supplierKind, city: b.city, categories: [b.category] })
        : null;
      const values = {
        category: b.category,
        supplierId,
        supplierName: b.supplierName,
        city: b.city,
        useCase: b.useCase,
        paxRef: b.paxRef,
        observedAt: b.observedAt,
        pricingModel: b.pricingModel,
        pricingModelLabel: b.pricingModelLabel,
        unit: b.unit,
        includedQuantity: b.includedQuantity,
        unitCostCents: b.unitCostCents,
        fixedCostCents: b.fixedCostCents,
        totalCents: b.totalCents,
        vatIncluded: b.vatIncluded,
        included: b.included,
        excluded: b.excluded,
        sourceKind: "sheet" as const,
        sourceKey: b.sourceKey,
        driveFileId: b.driveFileId,
        raw: b.raw,
      };
      await tx
        .insert(schema.priceBenchmarks)
        .values({ id: newId("bmk"), ...values })
        .onConflictDoUpdate({ target: schema.priceBenchmarks.sourceKey, set: values })
        .run();
    }
  });
  return diff;
}
