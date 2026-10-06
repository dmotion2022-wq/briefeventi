import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export type PlatformRow = typeof schema.platforms.$inferSelect;

const STATUS_ORDER: Record<string, number> = { in_uso: 0, da_valutare: 1, scartata: 2 };

export const sortPlatforms = (rows: PlatformRow[]) =>
  [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, "it"));

export async function listPlatforms(opts: { category?: string; status?: string; q?: string } = {}) {
  const rows = await getDb().select().from(schema.platforms).orderBy(asc(schema.platforms.name)).all();
  const q = opts.q?.trim().toLowerCase();
  return sortPlatforms(
    rows.filter(
      (p) =>
        (!opts.category || p.categories.includes(opts.category)) &&
        (!opts.status || p.status === opts.status) &&
        (!q || [p.name, p.description, p.coverage, p.domain, p.notes].some((v) => v?.toLowerCase().includes(q))),
    ),
  );
}

/** Piattaforme da proporre per una categoria: prima quelle in uso, mai le scartate. */
export async function platformsForCategories(categories: string[]) {
  const rows = await getDb().select().from(schema.platforms).where(sql`${schema.platforms.status} != 'scartata'`).all();
  return sortPlatforms(rows.filter((p) => p.categories.some((c) => categories.includes(c))));
}

export const getPlatform = (id: string) => getDb().select().from(schema.platforms).where(eq(schema.platforms.id, id)).get();

export async function platformCounts() {
  const rows = await getDb().select({ status: schema.platforms.status, categories: schema.platforms.categories }).from(schema.platforms).all();
  const byStatus: Record<string, number> = { in_uso: 0, da_valutare: 0, scartata: 0 };
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status !== "scartata") for (const c of r.categories) byCategory[c] = (byCategory[c] ?? 0) + 1;
  }
  return { total: rows.length, byStatus, byCategory };
}
