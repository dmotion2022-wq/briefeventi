import fs from "node:fs";
import path from "node:path";
import { getDb, schema } from "@/db/client";
import { buildQuoteXlsx } from "@/exports/xlsx";
import { newId } from "@/lib/ids";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import { eq } from "drizzle-orm";

export async function GET(req: Request, ctx: RouteContext<"/api/quotes/[id]/xlsx">) {
  const { id } = await ctx.params;
  const variant = new URL(req.url).searchParams.get("variant") === "internal" ? "internal" : "client";
  const { buffer, filename } = await buildQuoteXlsx(id, variant);

  // copia nell'archivio degli export del progetto
  ensureDataDirs();
  const quote = getDb().select().from(schema.quotes).where(eq(schema.quotes.id, id)).get()!;
  const rel = path.join("exports", `${newId("exp")}.xlsx`);
  fs.writeFileSync(dataPath(rel), buffer);
  getDb().insert(schema.exportsTable).values({ id: newId("exp"), projectId: quote.projectId, quoteId: id, kind: "xlsx", variant, path: rel }).run();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
