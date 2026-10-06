"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { safeNextPath } from "./next-path";
import { passwordProblem, hashPassword, verifyPassword } from "./password";
import { endSession, getCurrentUser, login, revokeSessions } from "./session";

export type FormState = { error?: string; ok?: string };

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const result = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect(result.mustChangePassword ? "/account?cambio=1" : safeNextPath(form.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || user.id === "local") return { error: "Accesso scaduto: entra di nuovo." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const repeat = String(form.get("repeat") ?? "");
  if (next !== repeat) return { error: "Le due password nuove non coincidono." };
  const problem = passwordProblem(next, user.email);
  if (problem) return { error: problem };
  if (next === current) return { error: "La nuova password deve essere diversa da quella attuale." };

  const db = getDb();
  const row = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "La password attuale non è corretta." };
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(schema.users.id, user.id))
    .run();
  // le altre sessioni aperte con la vecchia password si chiudono
  await revokeSessions(user.id, { except: "current" });
  if (user.mustChangePassword) redirect("/");
  return { ok: "Password aggiornata. Le altre sessioni aperte sono state chiuse." };
}

export async function logoutEverywhereAction() {
  const user = await getCurrentUser();
  if (user && user.id !== "local") await revokeSessions(user.id);
  await endSession();
  redirect("/login");
}
