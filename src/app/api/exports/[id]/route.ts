import path from "node:path";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { exportMime } from "@/exports/save";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/exports/[id]">) {
  await requireUser();
  const { id } = await ctx.params;
  const exp = await getDb().select().from(schema.exportsTable).where(eq(schema.exportsTable.id, id)).get();
  const file = exp ? await readFile(exp.path) : null;
  if (!exp || !file) return new Response("Export non trovato", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": exportMime[exp.kind], "Content-Disposition": `attachment; filename="${path.posix.basename(exp.path)}"` },
  });
}
