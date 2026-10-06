"use server";

import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { dataPath } from "@/lib/paths";
import { enqueueRun } from "@/worker/runs";

export async function generateImagesAction(projectId: string) {
  enqueueRun({ task: "images.generate", projectId, input: {} });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function generateOneImageAction(projectId: string, form: FormData) {
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return;
  enqueueRun({ task: "images.generate", projectId, input: { prompt, purpose: form.get("purpose") ?? "moodboard", size: form.get("size") ?? "1664*928" } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function selectKeyVisualAction(projectId: string, imageId: string) {
  const db = getDb();
  db.update(schema.imageAssets).set({ selected: false }).where(eq(schema.imageAssets.projectId, projectId)).run();
  db.update(schema.imageAssets).set({ selected: true }).where(and(eq(schema.imageAssets.id, imageId), eq(schema.imageAssets.projectId, projectId))).run();
  revalidatePath(`/projects/${projectId}/images`);
}

export async function deleteImageAction(projectId: string, imageId: string) {
  const db = getDb();
  const img = db.select().from(schema.imageAssets).where(and(eq(schema.imageAssets.id, imageId), eq(schema.imageAssets.projectId, projectId))).get();
  if (!img) return;
  db.delete(schema.imageAssets).where(eq(schema.imageAssets.id, imageId)).run();
  try {
    fs.unlinkSync(dataPath(img.path));
  } catch {
    // file già rimosso
  }
  revalidatePath(`/projects/${projectId}/images`);
}
