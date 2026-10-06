"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { enqueueRun } from "@/worker/runs";

const instructionsOf = (form: FormData) => String(form.get("instructions") ?? "").trim();

export async function developAgendaAction(projectId: string, form: FormData) {
  enqueueRun({ task: "agenda.develop", projectId, input: { instructions: instructionsOf(form) } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function developModulesAction(projectId: string, kinds: string[] | null, form: FormData) {
  enqueueRun({ task: "modules.develop", projectId, input: { kinds: kinds ?? undefined, instructions: instructionsOf(form) } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

const SlotInput = z.object({
  day: z.coerce.number().int().min(1),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  kind: z.enum(schema.SLOT_KINDS),
  title: z.string().trim().min(1),
  room: z.string().trim().optional(),
  pax: z.coerce.number().int().optional().or(z.literal("")),
});

export async function saveSlotAction(projectId: string, slotId: string | null, form: FormData) {
  const data = SlotInput.parse(Object.fromEntries(form));
  const db = getDb();
  const values = {
    day: data.day,
    startTime: data.startTime.padStart(5, "0"),
    endTime: data.endTime.padStart(5, "0"),
    kind: data.kind,
    title: data.title,
    room: data.room || null,
    pax: typeof data.pax === "number" ? data.pax : null,
  };
  if (slotId) {
    db.update(schema.agendaSlots).set(values).where(and(eq(schema.agendaSlots.id, slotId), eq(schema.agendaSlots.projectId, projectId))).run();
  } else {
    const pos = db.select({ p: max(schema.agendaSlots.position) }).from(schema.agendaSlots).where(eq(schema.agendaSlots.projectId, projectId)).get()?.p ?? 0;
    db.insert(schema.agendaSlots).values({ id: newId("slt"), projectId, position: pos + 1, ...values }).run();
  }
  // riordino per giorno e orario
  const slots = db.select().from(schema.agendaSlots).where(eq(schema.agendaSlots.projectId, projectId)).all();
  slots
    .sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime))
    .forEach((s, i) => db.update(schema.agendaSlots).set({ position: i + 1 }).where(eq(schema.agendaSlots.id, s.id)).run());
  revalidatePath(`/projects/${projectId}/agenda`);
}

export async function deleteSlotAction(projectId: string, slotId: string) {
  getDb().delete(schema.agendaSlots).where(and(eq(schema.agendaSlots.id, slotId), eq(schema.agendaSlots.projectId, projectId))).run();
  revalidatePath(`/projects/${projectId}/agenda`);
}
