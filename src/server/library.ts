"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { enqueueRun } from "@/worker/runs";

export async function startDriveImport(mode: "dry" | "full" | "contacts") {
  enqueueRun({ task: "library.import", input: { mode } });
  revalidatePath("/library/import");
}

const FormatInput = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().min(5),
  type: z.enum(["format", "sensory", "spatial", "narrative", "food", "social", "tech", "wellbeing", "learning"]),
  costLevel: z.enum(["low", "mid", "high"]),
  suppliersHint: z.string().trim().optional(),
  tags: z.string().trim().optional(),
});

export async function createFormat(form: FormData) {
  const data = FormatInput.parse(Object.fromEntries(form));
  getDb()
    .insert(schema.formatIdeas)
    .values({
      id: newId("fmt"),
      name: data.name,
      description: data.description,
      type: data.type,
      costLevel: data.costLevel,
      suppliersHint: data.suppliersHint || null,
      tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      triedByUs: form.get("triedByUs") === "on",
    })
    .run();
  revalidatePath("/library/formats");
}

export async function toggleFormat(id: string, field: "active" | "triedByUs") {
  const db = getDb();
  const row = db.select().from(schema.formatIdeas).where(eq(schema.formatIdeas.id, id)).get();
  if (!row) return;
  db.update(schema.formatIdeas).set({ [field]: !row[field] }).where(eq(schema.formatIdeas.id, id)).run();
  revalidatePath("/library/formats");
}

export async function startOcrAction() {
  enqueueRun({ task: "documents.ocr", input: {} });
  revalidatePath("/library/import");
}

export async function startLibraryExtractAction() {
  enqueueRun({ task: "library.extract", input: {} });
  revalidatePath("/library/import");
}

export async function reviewBenchmarkAction(id: string, status: "approved" | "rejected") {
  getDb().update(schema.priceBenchmarks).set({ reviewStatus: status }).where(eq(schema.priceBenchmarks.id, id)).run();
  revalidatePath("/library/benchmarks");
}
