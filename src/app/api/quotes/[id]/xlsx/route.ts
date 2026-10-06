import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { saveAndRespond } from "@/exports/save";
import { buildQuoteXlsx } from "@/exports/xlsx";

export async function GET(req: Request, ctx: RouteContext<"/api/quotes/[id]/xlsx">) {
  await requireUser();
  const { id } = await ctx.params;
  const variant = new URL(req.url).searchParams.get("variant") === "internal" ? "internal" : "client";
  const quote = await getDb().select().from(schema.quotes).where(eq(schema.quotes.id, id)).get();
  if (!quote) return new Response("Preventivo non trovato", { status: 404 });
  const { buffer, filename } = await buildQuoteXlsx(id, variant);
  // copia nell'archivio degli export del progetto
  return saveAndRespond({ projectId: quote.projectId, quoteId: id, kind: "xlsx", variant, buffer, filename });
}
