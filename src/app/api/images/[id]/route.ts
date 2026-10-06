import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/images/[id]">) {
  await requireUser();
  const { id } = await ctx.params;
  const img = await getDb().select().from(schema.imageAssets).where(eq(schema.imageAssets.id, id)).get();
  const file = img ? await readFile(img.path) : null;
  if (!img || !file) return new Response("Immagine non trovata", { status: 404 });
  return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
