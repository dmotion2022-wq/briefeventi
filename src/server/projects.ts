"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hasApiKey } from "@/ai/qwen";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { createProject, updateProject } from "@/db/queries/projects";
import { createDocument, mimeFromName, type DocumentKind } from "@/domain/documents";
import { eurosToCents } from "@/lib/money";
import { deleteFile, readFile } from "@/lib/storage";
import type { BriefData } from "@/ai/schemas/brief";
import { enqueueRun } from "@/worker/runs";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const orNull = (v: FormDataEntryValue | null) => text(v) || null;

function kindFor(filename: string, isTender: boolean): DocumentKind {
  if (/\.eml$/i.test(filename)) return "email";
  return isTender ? "tender" : "brief";
}

const mimeOf = (name: string, type?: string | null) => (type && type !== "application/octet-stream" ? type : mimeFromName(name));

/**
 * File allegati al form: sul Mac arrivano con il form ("files"); online il browser li carica
 * prima nell'archivio (limite di 4,5 MB delle richieste su Vercel) e qui arrivano i percorsi ("uploaded").
 */
async function saveUploads(projectId: string, form: FormData, isTender: boolean) {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    await createDocument({
      projectId,
      kind: kindFor(file.name, isTender),
      filename: file.name,
      mime: mimeOf(file.name, file.type),
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  }
  let uploaded = 0;
  for (const raw of form.getAll("uploaded")) {
    let item: { pathname?: unknown; name?: unknown; type?: unknown };
    try {
      item = JSON.parse(String(raw));
    } catch {
      continue;
    }
    const pathname = String(item.pathname ?? "");
    // solo i caricamenti temporanei fatti dal browser, mai altri file dell'archivio
    if (!/^uploads\/[^/]+$/.test(pathname)) continue;
    const buffer = await readFile(pathname);
    if (!buffer) continue;
    const name = String(item.name ?? pathname.split("/").pop());
    await createDocument({ projectId, kind: kindFor(name, isTender), filename: name, mime: mimeOf(name, String(item.type ?? "")), buffer });
    await deleteFile(pathname);
    uploaded++;
  }
  return files.length + uploaded;
}

const NewProject = z.object({
  title: z.string().min(2, "Dai un nome al progetto"),
  clientName: z.string().min(1, "Indica il cliente"),
  sector: z.enum(schema.SECTORS),
});

export async function createProjectAction(form: FormData) {
  await requireUser();
  const base = NewProject.parse({ title: text(form.get("title")), clientName: text(form.get("clientName")), sector: form.get("sector") });
  const isTender = form.get("isTender") === "on";
  const confidential = form.get("confidential") === "on";
  const project = await createProject({
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
    await enqueueRun({ task: "brief.extract", projectId: project.id });
  }
  redirect(`/projects/${project.id}/brief`);
}

export async function addDocumentsAction(projectId: string, form: FormData) {
  await requireUser();
  const project = await getDb().select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
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
  await requireUser();
  await getDb()
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.projectId, projectId)))
    .run();
  revalidatePath(`/projects/${projectId}/brief`);
}

export async function runTask(projectId: string, task: "brief.extract" | "gap.analyze") {
  await requireUser();
  await enqueueRun({ task, projectId });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function confirmBriefAction(projectId: string, briefId: string) {
  await requireUser();
  await getDb()
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
  await requireUser();
  const db = getDb();
  const brief = await db.select().from(schema.briefs).where(and(eq(schema.briefs.id, briefId), eq(schema.briefs.projectId, projectId))).get();
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
  await db.update(schema.briefs).set({ data: d, status: "draft", confirmedAt: null }).where(eq(schema.briefs.id, briefId)).run();
  await updateProject(projectId, {
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
  await requireUser();
  await getDb()
    .update(schema.gapItems)
    .set({ answer: orNull(form.get("answer")), assumptionAccepted: form.get("accept") === "on" })
    .where(and(eq(schema.gapItems.id, gapId), eq(schema.gapItems.projectId, projectId)))
    .run();
  revalidatePath(`/projects/${projectId}/gaps`);
}

export async function updateProjectStatusAction(projectId: string, form: FormData) {
  await requireUser();
  const status = z.enum(schema.PROJECT_STATUSES).parse(form.get("status"));
  await updateProject(projectId, { status });
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Elimina un progetto con tutto ciò che contiene (documenti, preventivi, collegamenti). I file degli export restano nell'archivio. */
export async function deleteProjectAction(projectId: string) {
  await requireUser();
  const db = getDb();
  // i prezzi confermati nel progetto restano nel listino: sono dati reali dei fornitori
  await db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
  revalidatePath("/");
  redirect("/");
}
