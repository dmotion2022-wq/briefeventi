import { and, eq } from "drizzle-orm";
import { makeImage } from "@/ai/generate";
import { latestBible } from "@/ai/context";
import type { BibleData } from "@/ai/schemas/creative";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { saveFile } from "@/lib/storage";
import type { JobHandler } from "../context";
import { continueLater, throwIfCancelled } from "../context";

// Un'immagine richiede di solito 10-40 secondi.
const IMAGE_MS = 70_000;

type ImageRequest = { purpose: "key_visual" | "moodboard" | "application"; prompt: string; size: string; title?: string };

const NEGATIVE = "testo, scritte, lettere, loghi, watermark, firme, volti deformati, mani deformate, bassa qualità";

/** Genera le immagini e le salva subito nell'archivio (i link di Qwen-Image scadono dopo 24 ore). */
export const imagesGenerate: JobHandler = async (ctx) => {
  const db = getDb();
  const projectId = ctx.projectId!;
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw new Error("Progetto non trovato");

  let requests: ImageRequest[] = [];
  if (Array.isArray(ctx.input.requests)) {
    // ripresa in cloud: l'elenco è già deciso
    requests = ctx.input.requests as ImageRequest[];
  } else if (ctx.input.prompt) {
    requests = [{ purpose: (ctx.input.purpose as ImageRequest["purpose"]) ?? "moodboard", prompt: String(ctx.input.prompt), size: String(ctx.input.size ?? "1664*928") }];
  } else {
    const bible = await latestBible(projectId);
    if (!bible) throw new Error("Serve la concept bible: contiene l'art direction e i prompt");
    const b = bible.data as unknown as BibleData;
    const graphic = await db.select().from(schema.modules).where(and(eq(schema.modules.projectId, projectId), eq(schema.modules.kind, "graphic"))).get();
    const fromModule = ((graphic?.data as { imagePrompts?: ImageRequest[] } | undefined)?.imagePrompts ?? []).filter((p) => p.purpose !== "key_visual");
    requests = [
      { purpose: "key_visual", prompt: b.keyVisual.imagePrompt, size: "1664*928", title: "Key visual" },
      ...b.moodboardPrompts.slice(0, 4).map((p) => ({ purpose: "moodboard" as const, prompt: p, size: "1328*1328" })),
      ...fromModule.slice(0, 3),
    ];
  }

  // palette e tono della bible guidano tutte le immagini
  const bible = (await latestBible(projectId))?.data as unknown as BibleData | undefined;
  const style = bible ? ` Palette: ${bible.palette.map((p) => p.hex).join(", ")}. Atmosfera: ${bible.toneWords.join(", ")}. Fotografia professionale per un evento corporate, nessun testo nell'immagine.` : "";

  const saved: string[] = (ctx.input.saved as string[] | undefined) ?? [];
  for (const [i, req] of requests.entries()) {
    if (i < saved.length) continue;
    throwIfCancelled(ctx.signal);
    // almeno un'immagine per esecuzione, poi si riparte se il tempo non basta
    if (saved.length > 0 && ctx.timeLeft() < IMAGE_MS) {
      return continueLater({ ...ctx.input, requests, saved }, `Immagini pronte: ${saved.length} di ${requests.length}. Continua…`);
    }
    ctx.progress(5 + (i / requests.length) * 90, `Immagine ${i + 1} di ${requests.length}: ${req.title ?? req.purpose}`);
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const res = await makeImage(
      { task: "images.generate", runId: ctx.runId, projectId, signal: ctx.signal },
      { pro: req.purpose === "key_visual", prompt: `${req.prompt}${style}`, negativePrompt: NEGATIVE, size: req.size, seed },
    );
    const img = await fetch(res.url, { signal: ctx.signal });
    if (!img.ok) throw new Error(`Download dell'immagine non riuscito (HTTP ${img.status})`);
    const buffer = Buffer.from(await img.arrayBuffer());
    const id = newId("img");
    const rel = await saveFile(`images/${id}.png`, buffer, "image/png");
    const [w, h] = req.size.split("*").map(Number);
    await db
      .insert(schema.imageAssets)
      .values({ id, projectId, purpose: req.purpose, prompt: req.prompt, negativePrompt: NEGATIVE, model: res.model, size: req.size, seed, path: rel, width: w, height: h, runId: ctx.runId })
      .run();
    saved.push(id);
  }
  // se non c'è ancora un key visual scelto, si sceglie il primo generato
  const hasSelected = await db
    .select()
    .from(schema.imageAssets)
    .where(and(eq(schema.imageAssets.projectId, projectId), eq(schema.imageAssets.selected, true)))
    .get();
  const firstKv = await db
    .select()
    .from(schema.imageAssets)
    .where(and(eq(schema.imageAssets.projectId, projectId), eq(schema.imageAssets.purpose, "key_visual")))
    .get();
  if (!hasSelected && firstKv) await db.update(schema.imageAssets).set({ selected: true }).where(eq(schema.imageAssets.id, firstKv.id)).run();
  return { images: saved.length };
};
