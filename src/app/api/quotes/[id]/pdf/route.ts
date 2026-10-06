import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { htmlToPdf } from "@/exports/pdf";
import { buildQuoteHtml } from "@/exports/quote-html";
import { saveAndRespond } from "@/exports/save";

export async function GET(_req: Request, ctx: RouteContext<"/api/quotes/[id]/pdf">) {
  const { id } = await ctx.params;
  const quote = getDb().select().from(schema.quotes).where(eq(schema.quotes.id, id)).get();
  if (!quote) return new Response("Preventivo non trovato", { status: 404 });
  const project = getDb().select().from(schema.projects).where(eq(schema.projects.id, quote.projectId)).get()!;
  const pdf = await htmlToPdf(buildQuoteHtml(id), { footer: `${quote.number}${quote.revision > 1 ? ` rev. ${quote.revision}` : ""} · ${project.clientName}` });
  return saveAndRespond({ projectId: quote.projectId, quoteId: id, kind: "pdf", variant: "client", buffer: Buffer.from(pdf), filename: `${quote.number} ${project.clientName}.pdf` });
}
