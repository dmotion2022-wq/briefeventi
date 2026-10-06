"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { extractEmails, formatPhoneDisplay, normalizePhone, phoneType } from "@/domain/contacts/phone";
import { newId } from "@/lib/ids";

const SupplierPatch = z.object({
  name: z.string().trim().min(2),
  kind: z.enum(schema.SUPPLIER_KINDS),
  city: z.string().trim().nullable(),
  region: z.string().trim().nullable(),
  website: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
  rating: z.coerce.number().int().min(1).max(5).nullable(),
});

const nullIfEmpty = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

export async function updateSupplier(id: string, form: FormData) {
  const data = SupplierPatch.parse({
    name: form.get("name"),
    kind: form.get("kind"),
    city: nullIfEmpty(form.get("city")),
    region: nullIfEmpty(form.get("region")),
    website: nullIfEmpty(form.get("website")),
    notes: nullIfEmpty(form.get("notes")),
    rating: nullIfEmpty(form.get("rating")),
  });
  const website = data.website && !/^https?:\/\//i.test(data.website) ? `https://${data.website}` : data.website;
  const domain = website ? new URL(website).hostname.replace(/^www\./, "") : null;
  getDb().update(schema.suppliers).set({ ...data, website, domain }).where(eq(schema.suppliers.id, id)).run();
  revalidatePath(`/library/suppliers/${id}`);
}

export async function createSupplier(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) throw new Error("Nome troppo corto");
  const id = newId("sup");
  getDb()
    .insert(schema.suppliers)
    .values({
      id,
      name,
      kind: z.enum(schema.SUPPLIER_KINDS).catch("other").parse(form.get("kind")),
      city: nullIfEmpty(form.get("city")),
      source: "manual",
    })
    .run();
  revalidatePath("/library/suppliers");
  return id;
}

/** Contatto inserito a mano: il numero viene normalizzato, lo stato dice come è stato verificato. */
export async function addContact(supplierId: string, form: FormData) {
  const raw = String(form.get("value") ?? "").trim();
  const person = nullIfEmpty(form.get("person"));
  const role = nullIfEmpty(form.get("role"));
  const verifiedByCall = form.get("verified") === "on";
  const db = getDb();
  const now = new Date().toISOString();
  const email = extractEmails(raw)[0]?.value;
  if (email) {
    db.insert(schema.supplierContacts)
      .values({
        id: newId("cnt"),
        supplierId,
        type: "email",
        value: email,
        display: email,
        person,
        role,
        status: "verified",
        verificationMethod: "manual_entry",
        verifiedAt: now,
      })
      .onConflictDoNothing()
      .run();
  } else {
    const e164 = normalizePhone(raw);
    if (!e164) throw new Error("Numero di telefono non valido");
    db.insert(schema.supplierContacts)
      .values({
        id: newId("cnt"),
        supplierId,
        type: phoneType(e164),
        value: e164,
        display: formatPhoneDisplay(e164),
        person,
        role,
        status: verifiedByCall ? "verified" : "to_verify",
        verificationMethod: verifiedByCall ? "manual_call" : "manual_entry",
        verifiedAt: verifiedByCall ? now : null,
      })
      .onConflictDoNothing()
      .run();
  }
  revalidatePath(`/library/suppliers/${supplierId}`);
}

export async function setContactStatus(contactId: string, status: "verified" | "invalid") {
  const db = getDb();
  const contact = db.select().from(schema.supplierContacts).where(eq(schema.supplierContacts.id, contactId)).get();
  if (!contact) return;
  db.update(schema.supplierContacts)
    .set(
      status === "verified"
        ? { status, verificationMethod: "manual_call", verifiedAt: new Date().toISOString() }
        : { status },
    )
    .where(eq(schema.supplierContacts.id, contactId))
    .run();
  revalidatePath(`/library/suppliers/${contact.supplierId}`);
}

export async function deleteContact(contactId: string) {
  const db = getDb();
  const contact = db.select().from(schema.supplierContacts).where(eq(schema.supplierContacts.id, contactId)).get();
  if (!contact) return;
  db.delete(schema.supplierContacts).where(eq(schema.supplierContacts.id, contactId)).run();
  revalidatePath(`/library/suppliers/${contact.supplierId}`);
}
