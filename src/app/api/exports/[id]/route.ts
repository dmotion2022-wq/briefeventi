import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exportMime } from "@/exports/save";
import { dataPath } from "@/lib/paths";

export async function GET(_req: Request, ctx: RouteContext<"/api/exports/[id]">) {
  const { id } = await ctx.params;
  const exp = getDb().select().from(schema.exportsTable).where(eq(schema.exportsTable.id, id)).get();
  if (!exp || !fs.existsSync(dataPath(exp.path))) return new Response("Export non trovato", { status: 404 });
  return new Response(fs.readFileSync(dataPath(exp.path)), {
    headers: { "Content-Type": exportMime[exp.kind], "Content-Disposition": `attachment; filename="${path.basename(exp.path)}"` },
  });
}
