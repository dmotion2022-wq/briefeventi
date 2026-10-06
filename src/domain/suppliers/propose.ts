import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";

// Per ogni voce del preventivo propone i fornitori dell'archivio da chiamare:
// prima quelli indicati dai moduli (location e hotel candidati), poi stessa categoria
// e stessa città/regione, preferendo chi ha telefoni verificati. Massimo 3 per voce.

const KIND_BY_CATEGORY: Record<string, string[]> = {
  location: ["venue"],
  sale_allestimento: ["venue", "staging"],
  pernottamento: ["hotel"],
  catering: ["catering", "venue"],
  av_regia: ["av"],
  allestimenti: ["staging"],
  transfer: ["transport", "dmc"],
  staff: ["staff"],
  intrattenimento: ["entertainment", "experience"],
  engagement: ["experience", "entertainment", "av"],
  gadget: ["gadget", "print"],
  comunicazione: ["print"],
};

type ModuleCandidates = { candidates?: { venueId: string | null }[] };

export async function proposeArchiveSuppliers(projectId: string, quoteId: string) {
  const db = getDb();
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return 0;
  const lines = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.quoteId, quoteId)).all();
  const componentIds = lines.map((l) => l.componentId).filter((x): x is string => !!x);
  const components = new Map(
    (componentIds.length ? await db.select().from(schema.components).where(inArray(schema.components.id, componentIds)).all() : []).map((c) => [c.id, c]),
  );
  const suppliers = await db
    .select({
      supplier: schema.suppliers,
      verified: sql<number>`(select count(*) from supplier_contacts c where c.supplier_id = "suppliers"."id" and c.status = 'verified' and c.type in ('phone','mobile'))`,
    })
    .from(schema.suppliers)
    .all();

  // location e hotel suggeriti dai moduli
  const modules = await db.select().from(schema.modules).where(eq(schema.modules.projectId, projectId)).all();
  const suggestedVenueIds = new Set(
    modules
      .filter((m) => m.kind === "venue" || m.kind === "accommodation")
      .flatMap((m) => ((m.data as ModuleCandidates).candidates ?? []).map((c) => c.venueId).filter((x): x is string => !!x)),
  );
  const suggestedSupplierIds = new Set(
    (suggestedVenueIds.size ? await db.select().from(schema.venues).where(inArray(schema.venues.id, [...suggestedVenueIds])).all() : [])
      .map((v) => v.supplierId)
      .filter((x): x is string => !!x),
  );

  const city = project.city?.toLowerCase();
  const region = project.region?.toLowerCase();
  const existing = new Set(
    (
      await db
        .select({ l: schema.supplierLinks.quoteLineId, s: schema.supplierLinks.supplierId })
        .from(schema.supplierLinks)
        .where(eq(schema.supplierLinks.projectId, projectId))
        .all()
    ).map((x) => `${x.l}|${x.s}`),
  );

  let created = 0;
  for (const line of lines) {
    const comp = line.componentId ? components.get(line.componentId) : undefined;
    const category = comp?.category ?? "";
    const specKind = (comp?.specs as { supplierKind?: string } | null)?.supplierKind;
    const kinds = new Set([...(specKind ? [specKind] : []), ...(KIND_BY_CATEGORY[category] ?? [])]);
    if (!kinds.size) continue;
    const ranked = suppliers
      .filter(({ supplier }) => kinds.has(supplier.kind))
      .map(({ supplier, verified }) => {
        let score = 0;
        if (suggestedSupplierIds.has(supplier.id) && (category === "location" || category === "pernottamento" || category === "sale_allestimento")) score += 100;
        if (city && supplier.city?.toLowerCase() === city) score += 20;
        if (region && supplier.region?.toLowerCase() === region) score += 10;
        if (verified > 0) score += 5;
        if (supplier.rating) score += supplier.rating;
        return { supplier, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const { supplier } of ranked) {
      if (existing.has(`${line.id}|${supplier.id}`)) continue;
      await db
        .insert(schema.supplierLinks)
        .values({ id: newId("lnk"), projectId, quoteLineId: line.id, componentId: line.componentId, category, supplierId: supplier.id, status: "to_contact" })
        .run();
      existing.add(`${line.id}|${supplier.id}`);
      created++;
    }
  }
  return created;
}

/** Collegamenti di un progetto, raggruppati per voce di preventivo. */
export function linksForProject(projectId: string) {
  return getDb()
    .select({ link: schema.supplierLinks, supplier: schema.suppliers })
    .from(schema.supplierLinks)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierLinks.supplierId))
    .where(and(eq(schema.supplierLinks.projectId, projectId)))
    .all();
}
