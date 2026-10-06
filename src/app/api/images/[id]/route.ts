import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { dataPath } from "@/lib/paths";

export async function GET(_req: Request, ctx: RouteContext<"/api/images/[id]">) {
  const { id } = await ctx.params;
  const img = getDb().select().from(schema.imageAssets).where(eq(schema.imageAssets.id, id)).get();
  if (!img || !fs.existsSync(dataPath(img.path))) return new Response("Immagine non trovata", { status: 404 });
  return new Response(fs.readFileSync(dataPath(img.path)), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
