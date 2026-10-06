import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { getSetting } from "@/lib/settings";

// Bozza di richiesta di preventivo come file .eml: si apre in Mail/Outlook già compilata.
export async function GET(_req: Request, ctx: RouteContext<"/api/rfq/[id]">) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  const draft = await db.select().from(schema.rfqDrafts).where(eq(schema.rfqDrafts.id, id)).get();
  if (!draft) return new Response("Bozza non trovata", { status: 404 });
  const link = await db.select().from(schema.supplierLinks).where(eq(schema.supplierLinks.id, draft.linkId)).get();
  if (!link) return new Response("Collegamento non trovato", { status: 404 });
  const email = await db
    .select()
    .from(schema.supplierContacts)
    .where(and(eq(schema.supplierContacts.supplierId, link.supplierId), eq(schema.supplierContacts.type, "email")))
    .get();
  const agency = await getSetting("agency");
  const encode = (s: string) => `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
  const eml = [
    agency.email ? `From: ${encode(agency.name)} <${agency.email}>` : null,
    email ? `To: ${email.value}` : null,
    `Subject: ${encode(draft.subject)}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(draft.body).toString("base64").replace(/.{76}/g, "$&\r\n"),
  ]
    .filter((l) => l !== null)
    .join("\r\n");
  return new Response(eml, {
    headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="richiesta-preventivo.eml"` },
  });
}
