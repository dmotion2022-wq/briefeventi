import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

// Parte dell'accesso che serve anche al proxy (nessuna dipendenza da next/headers).

export type CurrentUser = { id: string; email: string; name: string; role: "admin" | "member"; mustChangePassword: boolean };

/** Login obbligatorio: sempre su Vercel, sul Mac solo se lo si chiede (AUTH_REQUIRED=1, per provarlo). */
export const authEnabled = () => !!process.env.VERCEL || process.env.AUTH_REQUIRED === "1";

export const secureCookies = () => !!process.env.VERCEL;
/** "__Host-" obbliga il browser a usarlo solo in https, su questo dominio e per tutto il sito. */
export const sessionCookieName = () => (secureCookies() ? "__Host-es_session" : "es_session");

export const SESSION_DAYS = 30;
const TOUCH_AFTER_MS = 24 * 3600_000;

/** Nel database si salva l'hash del gettone: chi legge il database non può riusare le sessioni. */
export const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

/** Utente di un gettone di sessione (cookie), o null se scaduto, revocato o disattivato. */
export async function userForToken(token: string | undefined | null, opts: { touch?: boolean } = {}): Promise<CurrentUser | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const db = getDb();
  const row = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, tokenId(token)))
    .get();
  if (!row || !row.user.active || Date.parse(row.session.expiresAt) < Date.now()) return null;
  if (opts.touch && Date.now() - Date.parse(row.session.lastSeenAt) > TOUCH_AFTER_MS) {
    const now = new Date();
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400_000).toISOString() })
      .where(eq(schema.sessions.id, row.session.id))
      .run();
  }
  const { id, email, name, role, mustChangePassword } = row.user;
  return { id, email, name, role, mustChangePassword };
}
