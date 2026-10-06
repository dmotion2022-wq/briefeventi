import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";

export function listProjects() {
  return getDb().select().from(schema.projects).orderBy(desc(schema.projects.updatedAt)).all();
}

export function getProject(id: string) {
  return getDb().select().from(schema.projects).where(eq(schema.projects.id, id)).get();
}

/** Codice progressivo per anno: EVT-2026-001, EVT-2026-002… */
export function nextCounter(key: string) {
  const db = getDb();
  const row = db
    .insert(schema.counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: schema.counters.key, set: { value: sql`${schema.counters.value} + 1` } })
    .returning()
    .get();
  return row.value;
}

export function createProject(input: Omit<typeof schema.projects.$inferInsert, "id" | "code">) {
  const year = new Date().getFullYear();
  const n = nextCounter(`project-${year}`);
  const project = { ...input, id: newId("prj"), code: `EVT-${year}-${String(n).padStart(3, "0")}` };
  getDb().insert(schema.projects).values(project).run();
  return project;
}

export function updateProject(id: string, patch: Partial<typeof schema.projects.$inferInsert>) {
  getDb().update(schema.projects).set(patch).where(eq(schema.projects.id, id)).run();
}
