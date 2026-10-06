import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { readFile } from "@/lib/storage";

// Apre un documento archiviato nel browser (i link aggiungono #page=N per la pagina della prova).
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  await requireUser();
  const { id } = await ctx.params;
  const doc = await getDb().select().from(schema.documents).where(eq(schema.documents.id, id)).get();
  if (!doc) return new Response("Documento non trovato", { status: 404 });
  const file = await readFile(doc.path);
  if (!file) return new Response("File mancante", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
