import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/auth/session";

// Online i file dei brief vanno dal browser direttamente all'archivio privato (le richieste verso
// le funzioni Vercel hanno un limite di 4,5 MB). Qui si autorizza il singolo caricamento.

const TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "message/rfc822",
  "application/octet-stream",
];

export async function POST(request: Request) {
  await requireUser();
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^uploads\/[^/]+$/.test(pathname)) throw new Error("Percorso di caricamento non consentito");
        return { allowedContentTypes: TYPES, maximumSizeInBytes: 60 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
