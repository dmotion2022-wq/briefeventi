"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { deleteFile } from "@/lib/storage";
import { enqueueRun } from "@/worker/runs";

export async function generateImagesAction(projectId: string) {
  await requireUser();
  await enqueueRun({ task: "images.generate", projectId, input: {} });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function generateOneImageAction(projectId: string, form: FormData) {
  await requireUser();
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return;
  await enqueueRun({
    task: "images.generate",
    projectId,
    input: { prompt, purpose: String(form.get("purpose") ?? "moodboard"), size: String(form.get("size") ?? "1664*928") },
  });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function selectKeyVisualAction(projectId: string, imageId: string) {
  await requireUser();
  const db = getDb();
  await db.update(schema.imageAssets).set({ selected: false }).where(eq(schema.imageAssets.projectId, projectId)).run();
  await db
    .update(schema.imageAssets)
    .set({ selected: true })
    .where(and(eq(schema.imageAssets.id, imageId), eq(schema.imageAssets.projectId, projectId)))
    .run();
  revalidatePath(`/projects/${projectId}/images`);
}

export async function deleteImageAction(projectId: string, imageId: string) {
  await requireUser();
  const db = getDb();
  const img = await db
    .select()
    .from(schema.imageAssets)
    .where(and(eq(schema.imageAssets.id, imageId), eq(schema.imageAssets.projectId, projectId)))
    .get();
  if (!img) return;
  await db.delete(schema.imageAssets).where(eq(schema.imageAssets.id, imageId)).run();
  await deleteFile(img.path).catch(() => {});
  revalidatePath(`/projects/${projectId}/images`);
}
