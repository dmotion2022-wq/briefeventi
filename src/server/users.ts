"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, temporaryPassword } from "@/auth/password";
import { requireAdmin, revokeSessions } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";

// Gestione degli accessi: li crea l'amministratore, con una password temporanea da comunicare
// a voce o in privato. Al primo accesso l'utente sceglie la sua.

export type UserActionState = { error?: string; ok?: string; password?: string; email?: string };

const NewUser = z.object({
  name: z.string().trim().min(2, "Scrivi nome e cognome."),
  email: z.string().trim().toLowerCase().email("Email non valida."),
  role: z.enum(schema.USER_ROLES),
});

const PATH = "/settings/users";

export async function createUserAction(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  await requireAdmin();
  const parsed = NewUser.safeParse({ name: form.get("name"), email: form.get("email"), role: form.get("role") ?? "member" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  const { name, email, role } = parsed.data;
  const db = getDb();
  if (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get()) {
    return { error: "Esiste già un utente con questa email." };
  }
  const password = temporaryPassword();
  await db
    .insert(schema.users)
    .values({ id: newId("usr"), name, email, role, passwordHash: await hashPassword(password), mustChangePassword: true })
    .run();
  revalidatePath(PATH);
  return { ok: `Accesso creato per ${name}.`, password, email };
}

export async function resetPasswordAction(userId: string, _prev: UserActionState): Promise<UserActionState> {
  await requireAdmin();
  const db = getDb();
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return { error: "Utente non trovato." };
  const password = temporaryPassword();
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null })
    .where(eq(schema.users.id, userId))
    .run();
  // chi aveva la vecchia password esce da tutti i dispositivi
  await revokeSessions(userId);
  revalidatePath(PATH);
  return { ok: `Nuova password temporanea per ${user.name}.`, password, email: user.email };
}

/** Deve restare almeno un amministratore attivo, e nessuno può togliersi l'accesso da solo. */
async function guardChange(adminId: string, userId: string, change: "deactivate" | "demote" | "delete") {
  if (adminId === userId) {
    return { deactivate: "Non puoi disattivare te stesso.", demote: "Non puoi toglierti il ruolo di amministratore.", delete: "Non puoi eliminare te stesso." }[change];
  }
  const db = getDb();
  const target = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target) return "Utente non trovato.";
  if (target.role === "admin" && target.active) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true), ne(schema.users.id, userId)))
      .all();
    if (n === 0) return "Deve restare almeno un amministratore attivo.";
  }
  return null;
}

export async function setUserActiveAction(userId: string, active: boolean) {
  const admin = await requireAdmin();
  if (!active) {
    const problem = await guardChange(admin.id, userId, "deactivate");
    if (problem) throw new Error(problem);
  }
  await getDb().update(schema.users).set({ active, failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, userId)).run();
  if (!active) await revokeSessions(userId);
  revalidatePath(PATH);
}

export async function setUserRoleAction(userId: string, role: "admin" | "member") {
  const admin = await requireAdmin();
  if (role === "member") {
    const problem = await guardChange(admin.id, userId, "demote");
    if (problem) throw new Error(problem);
  }
  await getDb().update(schema.users).set({ role }).where(eq(schema.users.id, userId)).run();
  revalidatePath(PATH);
}

export async function deleteUserAction(userId: string) {
  const admin = await requireAdmin();
  const problem = await guardChange(admin.id, userId, "delete");
  if (problem) throw new Error(problem);
  // le sessioni si cancellano con l'utente (chiave esterna); i dati dei progetti restano
  await revokeSessions(userId);
  await getDb().delete(schema.users).where(eq(schema.users.id, userId)).run();
  revalidatePath(PATH);
}
