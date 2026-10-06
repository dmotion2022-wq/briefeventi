import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { saveFile } from "@/lib/storage";

const MIME = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html; charset=utf-8",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** Salva una copia nell'archivio degli export del progetto e restituisce la risposta da scaricare. */
export async function saveAndRespond(args: {
  projectId: string;
  quoteId?: string | null;
  kind: keyof typeof MIME;
  variant: "client" | "internal" | "technical";
  buffer: Buffer;
  filename: string;
}) {
  const id = newId("exp");
  const rel = await saveFile(`exports/${id}.${args.kind}`, args.buffer, MIME[args.kind]);
  await getDb()
    .insert(schema.exportsTable)
    .values({ id, projectId: args.projectId, quoteId: args.quoteId ?? null, kind: args.kind, variant: args.variant, path: rel })
    .run();
  return new Response(new Uint8Array(args.buffer), {
    headers: {
      "Content-Type": MIME[args.kind],
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(args.filename)}`,
    },
  });
}

export const exportMime = MIME;
