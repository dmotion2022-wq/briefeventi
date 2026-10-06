import { requireUser } from "@/auth/session";
import { buildProposalHtml } from "@/exports/html";
import { htmlToPdf } from "@/exports/pdf";
import { saveAndRespond } from "@/exports/save";

export const maxDuration = 120;

// Proposta in PDF (per le gare che lo richiedono), dalla stessa pagina web in modalità stampa.
export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/pdf">) {
  await requireUser();
  const { id } = await ctx.params;
  const prices = new URL(req.url).searchParams.get("prices") === "1";
  const { html, filename } = await buildProposalHtml(id, { prices });
  const pdf = await htmlToPdf(html, { fullBleed: true, landscape: true });
  return saveAndRespond({ projectId: id, kind: "pdf", variant: prices ? "client" : "technical", buffer: Buffer.from(pdf), filename: filename.replace(/\.html$/, ".pdf") });
}
