import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { htmlToPdf } from "@/exports/pdf";
import { buildQuoteHtml } from "@/exports/quote-html";
import { saveAndRespond } from "@/exports/save";

export const maxDuration = 120;

export async function GET(_req: Request, ctx: RouteContext<"/api/quotes/[id]/pdf">) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  const quote = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).get();
  if (!quote) return new Response("Preventivo non trovato", { status: 404 });
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, quote.projectId)).get();
  if (!project) return new Response("Progetto non trovato", { status: 404 });
  const pdf = await htmlToPdf(await buildQuoteHtml(id), { footer: `${quote.number}${quote.revision > 1 ? ` rev. ${quote.revision}` : ""} · ${project.clientName}` });
  return saveAndRespond({ projectId: quote.projectId, quoteId: id, kind: "pdf", variant: "client", buffer: Buffer.from(pdf), filename: `${quote.number} ${project.clientName}.pdf` });
}
