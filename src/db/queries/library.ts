import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export function listSuppliers(opts: { q?: string; kind?: string } = {}) {
  const db = getDb();
  const filters = [];
  if (opts.q) {
    const q = `%${opts.q}%`;
    filters.push(or(like(schema.suppliers.name, q), like(schema.suppliers.city, q), like(schema.suppliers.region, q)));
  }
  if (opts.kind) filters.push(eq(schema.suppliers.kind, opts.kind as (typeof schema.SUPPLIER_KINDS)[number]));
  return db
    .select({
      supplier: schema.suppliers,
      phones: sql<number>`(select count(*) from supplier_contacts c where c.supplier_id = "suppliers"."id" and c.type in ('phone','mobile') and c.status != 'invalid')`,
      emails: sql<number>`(select count(*) from supplier_contacts c where c.supplier_id = "suppliers"."id" and c.type = 'email' and c.status != 'invalid')`,
      firstPhone: sql<string | null>`(select c.value from supplier_contacts c where c.supplier_id = "suppliers"."id" and c.type in ('phone','mobile') and c.status != 'invalid' order by c.status = 'verified' desc, c.created_at limit 1)`,
    })
    .from(schema.suppliers)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(schema.suppliers.name))
    .all();
}

export function getSupplierDetail(id: string) {
  const db = getDb();
  const supplier = db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)).get();
  if (!supplier) return null;
  return {
    supplier,
    contacts: db
      .select()
      .from(schema.supplierContacts)
      .where(eq(schema.supplierContacts.supplierId, id))
      .orderBy(desc(sql`${schema.supplierContacts.status} = 'verified'`), asc(schema.supplierContacts.type))
      .all(),
    venues: db.select().from(schema.venues).where(eq(schema.venues.supplierId, id)).all(),
    benchmarks: db.select().from(schema.priceBenchmarks).where(eq(schema.priceBenchmarks.supplierId, id)).all(),
    links: db
      .select({ link: schema.supplierLinks, project: schema.projects })
      .from(schema.supplierLinks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.supplierLinks.projectId))
      .where(eq(schema.supplierLinks.supplierId, id))
      .all(),
  };
}

export function listVenues(opts: { q?: string } = {}) {
  const db = getDb();
  const q = opts.q ? `%${opts.q}%` : null;
  return db
    .select()
    .from(schema.venues)
    .where(
      q
        ? or(like(schema.venues.name, q), like(schema.venues.city, q), like(schema.venues.region, q), like(schema.venues.tags, q))
        : undefined,
    )
    .orderBy(asc(schema.venues.name))
    .all();
}

export const listWorks = () =>
  getDb().select().from(schema.referenceWorks).orderBy(desc(schema.referenceWorks.fitScore), asc(schema.referenceWorks.name)).all();

export const listBenchmarks = () =>
  getDb().select().from(schema.priceBenchmarks).orderBy(asc(schema.priceBenchmarks.category), asc(schema.priceBenchmarks.supplierName)).all();

export const listFormats = () => getDb().select().from(schema.formatIdeas).orderBy(asc(schema.formatIdeas.type), asc(schema.formatIdeas.name)).all();

export const documentsByIds = (ids: (string | null)[]) => {
  const valid = ids.filter((x): x is string => !!x);
  if (!valid.length) return new Map<string, typeof schema.documents.$inferSelect>();
  const rows = getDb()
    .select()
    .from(schema.documents)
    .where(sql`${schema.documents.id} in ${valid}`)
    .all();
  return new Map(rows.map((d) => [d.id, d]));
};
