"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth/session";
import { enqueueRun } from "@/worker/runs";

export async function generateConceptsAction(projectId: string, form: FormData) {
  await requireUser();
  const instructions = String(form.get("instructions") ?? "").trim();
  await enqueueRun({ task: "concept.generate", projectId, input: { instructions } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function buildBibleAction(projectId: string, conceptId: string, form: FormData) {
  await requireUser();
  const instructions = String(form.get("instructions") ?? "").trim();
  const mergeConceptIds = form.getAll("merge").map(String).filter((id) => id && id !== conceptId);
  await enqueueRun({ task: "bible.build", projectId, input: { conceptId, instructions, mergeConceptIds } });
  revalidatePath(`/projects/${projectId}`, "layout");
}
