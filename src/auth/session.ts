import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { prepareDb } from "@/db/prepare";
import { newId } from "@/lib/ids";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { authEnabled, type CurrentUser, SESSION_DAYS, secureCookies, sessionCookieName, tokenId, userForToken } from "./token";

export { authEnabled, type CurrentUser } from "./token";

// Accesso con email e password per la versione online. Sul Mac (senza login) l'app risponde
// solo da localhost e tutte le funzioni girano come "amministratore locale".

const LOCAL_USER: CurrentUser = { id: "local", email: "", name: "Tu (sul Mac)", role: "admin", mustChangePassword: false };

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Utente della richiesta in corso (una sola lettura per richiesta). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!authEnabled()) return LOCAL_USER;
  await prepareDb();
  const token = (await cookies()).get(sessionCookieName())?.value;
  return userForToken(token, { touch: true });
});

/** Per azioni, pagine e API: senza accesso valido si torna al login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account?cambio=1");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Solo un amministratore può farlo.");
  return user;
}

async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const db = getDb();
  await db
    .insert(schema.sessions)
    .values({ id: tokenId(token), userId, expiresAt: expires.toISOString(), lastSeenAt: now.toISOString(), userAgent })
    .run();
  // pulizia delle sessioni scadute, ogni tanto
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now.toISOString())).run();
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await getDb().delete(schema.sessions).where(eq(schema.sessions.id, tokenId(token))).run();
  jar.delete(sessionCookieName());
}

/** Chiude tutte le sessioni di un utente (password cambiata, utente disattivato). */
export async function revokeSessions(userId: string, opts: { except?: "current" } = {}) {
  const db = getDb();
  const current = opts.except === "current" ? (await cookies()).get(sessionCookieName())?.value : undefined;
  const keep = current ? tokenId(current) : null;
  const rows = await db.select({ id: schema.sessions.id }).from(schema.sessions).where(eq(schema.sessions.userId, userId)).all();
  for (const r of rows) if (r.id !== keep) await db.delete(schema.sessions).where(eq(schema.sessions.id, r.id)).run();
}

const sameSecret = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export type LoginResult = { ok: true; mustChangePassword: boolean } | { ok: false; error: string };

const WRONG = "Email o password non corretti.";

/**
 * Verifica email e password e apre la sessione. Il primo amministratore nasce qui: se non c'è
 * ancora nessun utente, valgono ADMIN_EMAIL e ADMIN_PASSWORD impostati su Vercel (poi va cambiata).
 */
export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  await prepareDb();
  const db = getDb();
  const email = normalizeEmail(emailRaw);
  if (!email || !password) return { ok: false, error: WRONG };

  let user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user) {
    const [{ n }] = await db.select({ n: count() }).from(schema.users).all();
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
    const adminPassword = process.env.ADMIN_PASSWORD ?? "";
    if (n === 0 && adminEmail && adminPassword && email === adminEmail && sameSecret(password, adminPassword)) {
      const id = newId("usr");
      await db
        .insert(schema.users)
        .values({ id, email, name: "Amministratore", role: "admin", passwordHash: await hashPassword(password), mustChangePassword: true })
        .onConflictDoNothing()
        .run();
      user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    }
  }
  if (!user) {
    await burnPasswordCheck(password);
    return { ok: false, error: n0Hint(await noUsersYet()) ?? WRONG };
  }
  if (!user.active) {
    await burnPasswordCheck(password);
    return { ok: false, error: WRONG };
  }
  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    return { ok: false, error: `Troppi tentativi sbagliati: riprova dopo le ${new Date(user.lockedUntil).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}.` };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db
      .update(schema.users)
      .set({
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : user.lockedUntil,
      })
      .where(eq(schema.users.id, user.id))
      .run();
    return { ok: false, error: WRONG };
  }
  await db
    .update(schema.users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id))
    .run();
  await startSession(user.id);
  return { ok: true, mustChangePassword: user.mustChangePassword };
}

async function noUsersYet() {
  const [{ n }] = await getDb().select({ n: count() }).from(schema.users).all();
  return n === 0;
}

/** Con il database ancora vuoto si spiega come creare il primo accesso. */
function n0Hint(empty: boolean) {
  if (!empty) return null;
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    return "Nessun utente ancora: imposta ADMIN_EMAIL e ADMIN_PASSWORD nelle variabili d'ambiente del progetto su Vercel e ripubblica.";
  }
  return WRONG;
}

/** Sessioni attive di un utente (per la pagina Account). */
export async function activeSessionCount(userId: string) {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), gt(schema.sessions.expiresAt, new Date().toISOString())))
    .all();
  return n;
}
