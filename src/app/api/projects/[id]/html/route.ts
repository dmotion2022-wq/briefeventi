import { buildProposalHtml } from "@/exports/html";
import { saveAndRespond } from "@/exports/save";

export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/html">) {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const prices = sp.get("prices") === "1";
  const { html, filename } = await buildProposalHtml(id, { prices });
  if (sp.get("preview") === "1") return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  return saveAndRespond({ projectId: id, kind: "html", variant: prices ? "client" : "technical", buffer: Buffer.from(html), filename });
}
