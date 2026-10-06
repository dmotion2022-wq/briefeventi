"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { formatPhoneDisplay, normalizePhone } from "@/domain/contacts/phone";
import { newId } from "@/lib/ids";
import { PLATFORM_CATEGORY_LABELS } from "@/lib/labels";

const PATH = "/library/platforms";
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const orNull = (v: FormDataEntryValue | null) => text(v) || null;

function urlOrNull(raw: string, label: string) {
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${label}: indirizzo non valido`);
  }
}

const domainOf = (url: string | null) => (url ? new URL(url).hostname.replace(/^www\./, "") : null);

export async function setPlatformStatusAction(id: string, status: (typeof schema.PLATFORM_STATUSES)[number]) {
  await requireUser();
  z.enum(schema.PLATFORM_STATUSES).parse(status);
  await getDb().update(schema.platforms).set({ status }).where(eq(schema.platforms.id, id)).run();
  revalidatePath(PATH);
  revalidatePath("/projects", "layout");
}

/** Campi modificabili di una scheda: note, contatti, copertura, link di ricerca. */
export async function updatePlatformAction(id: string, form: FormData) {
  await requireUser();
  const phoneRaw = text(form.get("phone"));
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) throw new Error("Telefono non valido");
  const email = orNull(form.get("email"))?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email non valida");
  const searchUrl = orNull(form.get("searchUrl"));
  if (searchUrl && !/\{q\}|\{city\}/.test(searchUrl)) throw new Error("Il link di ricerca deve contenere {q} e/o {city}");
  const current = await getDb().select().from(schema.platforms).where(eq(schema.platforms.id, id)).get();
  if (!current) return;
  await getDb()
    .update(schema.platforms)
    .set({
      notes: orNull(form.get("notes")),
      coverage: orNull(form.get("coverage")),
      organizerCost: orNull(form.get("organizerCost")),
      email,
      // un contatto cambiato a mano non ha più la pagina della ricerca come fonte
      emailSource: email && email === current.email ? current.emailSource : null,
      phone,
      phoneDisplay: phone ? formatPhoneDisplay(phone) : null,
      phoneSource: phone && phone === current.phone ? current.phoneSource : null,
      contactPage: urlOrNull(text(form.get("contactPage")), "Pagina contatti"),
      searchUrl: searchUrl ? urlOrNull(searchUrl, "Link di ricerca")!.replaceAll("%7Bq%7D", "{q}").replaceAll("%7Bcity%7D", "{city}") : null,
    })
    .where(eq(schema.platforms.id, id))
    .run();
  revalidatePath(PATH);
}

export async function createPlatformAction(form: FormData) {
  await requireUser();
  const name = text(form.get("name"));
  if (name.length < 2) throw new Error("Scrivi il nome della piattaforma");
  const url = urlOrNull(text(form.get("url")), "Sito");
  if (!url) throw new Error("Indica il sito della piattaforma");
  const categories = form.getAll("categories").map(String).filter((c) => c in PLATFORM_CATEGORY_LABELS);
  if (!categories.length) throw new Error("Scegli almeno una categoria");
  const phoneRaw = text(form.get("phone"));
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) throw new Error("Telefono non valido");
  await getDb()
    .insert(schema.platforms)
    .values({
      id: newId("plt"),
      name,
      url,
      domain: domainOf(url),
      categories,
      type: z.enum(schema.PLATFORM_TYPES).catch("directory").parse(form.get("type")),
      description: orNull(form.get("description")),
      coverage: orNull(form.get("coverage")),
      email: orNull(form.get("email"))?.toLowerCase() ?? null,
      phone,
      phoneDisplay: phone ? formatPhoneDisplay(phone) : null,
      notes: orNull(form.get("notes")),
      status: "in_uso",
      source: "manual",
    })
    .run();
  revalidatePath(PATH);
}

/** Si eliminano solo le piattaforme aggiunte a mano: quelle della ricerca si scartano (tornerebbero al prossimo avvio). */
export async function deletePlatformAction(id: string) {
  await requireUser();
  const db = getDb();
  const row = await db.select().from(schema.platforms).where(eq(schema.platforms.id, id)).get();
  if (!row) return;
  if (row.seedKey) throw new Error("Le piattaforme della ricerca non si eliminano: segnala come scartata.");
  await db.update(schema.suppliers).set({ platformId: null }).where(eq(schema.suppliers.platformId, id)).run();
  await db.delete(schema.platforms).where(eq(schema.platforms.id, id)).run();
  revalidatePath(PATH);
}
