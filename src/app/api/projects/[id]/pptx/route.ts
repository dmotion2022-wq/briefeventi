import { requireUser } from "@/auth/session";
import { buildProposalPptx } from "@/exports/pptx";
import { saveAndRespond } from "@/exports/save";

export const maxDuration = 120;

export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/pptx">) {
  await requireUser();
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const prices = sp.get("prices") === "1";
  const { buffer, filename } = await buildProposalPptx(id, { prices, safeFonts: sp.get("safe") === "1" });
  return saveAndRespond({ projectId: id, kind: "pptx", variant: prices ? "client" : "technical", buffer, filename });
}
