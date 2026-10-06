"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hasApiKey } from "@/ai/qwen";
import { getDb, schema } from "@/db/client";
import { createProject, updateProject } from "@/db/queries/projects";
import { createDocument, mimeFromName, type DocumentKind } from "@/domain/documents";
import { eurosToCents } from "@/lib/money";
import type { BriefData } from "@/ai/schemas/brief";
import { enqueueRun } from "@/worker/runs";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const orNull = (v: FormDataEntryValue | null) => text(v) || null;

function kindFor(filename: string, isTender: boolean): DocumentKind {
  if (/\.eml$/i.test(filename)) return "email";
  return isTender ? "tender" : "brief";
}

async function saveUploads(projectId: string, form: FormData, isTender: boolean) {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    await createDocument({
      projectId,
      kind: kindFor(file.name, isTender),
      filename: file.name,
      mime: file.type && file.type !== "application/octet-stream" ? file.type : mimeFromName(file.name),
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  }
  return files.length;
}

const NewProject = z.object({
  title: z.string().min(2, "Dai un nome al progetto"),
  clientName: z.string().min(1, "Indica il cliente"),
  sector: z.enum(schema.SECTORS),
});

export async function createProjectAction(form: FormData) {
  const base = NewProject.parse({ title: text(form.get("title")), clientName: text(form.get("clientName")), sector: form.get("sector") });
  const isTender = form.get("isTender") === "on";
  const confidential = form.get("confidential") === "on";
  const project = createProject({
    ...base,
    eventType: orNull(form.get("eventType")),
    isTender,
    tenderDeadline: orNull(form.get("tenderDeadline")),
    confidential,
    confidentialTerms: text(form.get("confidentialTerms"))
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    notes: orNull(form.get("notes")),
  });

  const pasted = text(form.get("briefText"));
  if (pasted) {
    await createDocument({
      projectId: project.id,
      kind: "brief",
      filename: "Brief incollato.txt",
      mime: "text/plain",
      buffer: Buffer.from(pasted, "utf8"),
    });
  }
  const uploaded = await saveUploads(project.id, form, isTender);
  if ((pasted || uploaded) && hasApiKey()) {
    enqueueRun({ task: "brief.extract", projectId: project.id });
  }
  redirect(`/projects/${project.id}/brief`);
}

export async function addDocumentsAction(projectId: string, form: FormData) {
  const project = getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return;
  const pasted = text(form.get("briefText"));
  if (pasted) {
    await createDocument({
      projectId,
      kind: "brief",
      filename: `Testo aggiunto ${new Date().toLocaleDateString("it-IT")}.txt`,
      mime: "text/plain",
      buffer: Buffer.from(pasted, "utf8"),
    });
  }
  await saveUploads(projectId, form, project.isTender);
  revalidatePath(`/projects/${projectId}/brief`);
}

export async function deleteDocumentAction(projectId: string, documentId: string) {
  getDb()
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.projectId, projectId)))
    .run();
  revalidatePath(`/projects/${projectId}/brief`);
}

export async function runTask(projectId: string, task: "brief.extract" | "gap.analyze") {
  enqueueRun({ task, projectId });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function confirmBriefAction(projectId: string, briefId: string) {
  getDb()
    .update(schema.briefs)
    .set({ status: "confirmed", confirmedAt: new Date().toISOString() })
    .where(and(eq(schema.briefs.id, briefId), eq(schema.briefs.projectId, projectId)))
    .run();
  revalidatePath(`/projects/${projectId}`, "layout");
}

const lines = (v: FormDataEntryValue | null) =>
  text(v)
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
const num = (v: FormDataEntryValue | null) => {
  const s = text(v).replace(",", ".");
  return s ? Number(s) : null;
};

/** Correzioni manuali ai campi principali del brief (la versione resta la stessa, torna in bozza). */
export async function updateBriefAction(projectId: string, briefId: string, form: FormData) {
  const db = getDb();
  const brief = db.select().from(schema.briefs).where(eq(schema.briefs.id, briefId)).get();
  if (!brief) return;
  const d = structuredClone(brief.data) as unknown as BriefData;
  d.summary = text(form.get("summary"));
  d.eventType = text(form.get("eventType"));
  d.objectives = lines(form.get("objectives"));
  d.requiredServices = lines(form.get("requiredServices"));
  d.constraints = lines(form.get("constraints"));
  d.tone = orNull(form.get("tone"));
  d.audience = { ...d.audience, paxMin: num(form.get("paxMin")), paxTarget: num(form.get("paxTarget")), paxMax: num(form.get("paxMax")) };
  d.dates = { ...d.dates, start: orNull(form.get("start")), end: orNull(form.get("end")) };
  d.location = { ...d.location, city: orNull(form.get("city")), region: orNull(form.get("region")) };
  d.budget = { ...d.budget, totalEuro: num(form.get("budgetTotal")), perPaxEuro: num(form.get("budgetPerPax")) };
  db.update(schema.briefs).set({ data: d, status: "draft", confirmedAt: null }).where(eq(schema.briefs.id, briefId)).run();
  updateProject(projectId, {
    eventType: d.eventType || null,
    paxTarget: d.audience.paxTarget ?? d.audience.paxMax ?? null,
    paxMin: d.audience.paxMin,
    paxMax: d.audience.paxMax,
    startDate: d.dates.start,
    endDate: d.dates.end,
    city: d.location.city,
    region: d.location.region,
    budgetCents: d.budget.totalEuro != null ? eurosToCents(d.budget.totalEuro) : null,
  });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function answerGapAction(projectId: string, gapId: string, form: FormData) {
  getDb()
    .update(schema.gapItems)
    .set({ answer: orNull(form.get("answer")), assumptionAccepted: form.get("accept") === "on" })
    .where(and(eq(schema.gapItems.id, gapId), eq(schema.gapItems.projectId, projectId)))
    .run();
  revalidatePath(`/projects/${projectId}/gaps`);
}

export async function updateProjectStatusAction(projectId: string, form: FormData) {
  const status = z.enum(schema.PROJECT_STATUSES).parse(form.get("status"));
  updateProject(projectId, { status });
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Elimina un progetto con tutto ciò che contiene (documenti, preventivi, collegamenti). I file degli export restano in data/. */
export async function deleteProjectAction(projectId: string) {
  const db = getDb();
  // i prezzi confermati nel progetto restano nel listino: sono dati reali dei fornitori
  db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
  revalidatePath("/");
  redirect("/");
}
