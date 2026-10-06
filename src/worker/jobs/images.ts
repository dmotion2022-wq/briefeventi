import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { makeImage } from "@/ai/generate";
import { latestBible } from "@/ai/context";
import type { BibleData } from "@/ai/schemas/creative";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import type { JobHandler } from "../context";
import { throwIfCancelled } from "../context";

type ImageRequest = { purpose: "key_visual" | "moodboard" | "application"; prompt: string; size: string; title?: string };

const NEGATIVE = "testo, scritte, lettere, loghi, watermark, firme, volti deformati, mani deformate, bassa qualità";

/** Genera le immagini e le salva subito in locale (i link di Qwen-Image scadono dopo 24 ore). */
export const imagesGenerate: JobHandler = async (ctx) => {
  const db = getDb();
  const projectId = ctx.projectId!;
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw new Error("Progetto non trovato");

  let requests: ImageRequest[] = [];
  if (ctx.input.prompt) {
    requests = [{ purpose: (ctx.input.purpose as ImageRequest["purpose"]) ?? "moodboard", prompt: String(ctx.input.prompt), size: String(ctx.input.size ?? "1664*928") }];
  } else {
    const bible = latestBible(projectId);
    if (!bible) throw new Error("Serve la concept bible: contiene l'art direction e i prompt");
    const b = bible.data as unknown as BibleData;
    const graphic = db.select().from(schema.modules).where(and(eq(schema.modules.projectId, projectId), eq(schema.modules.kind, "graphic"))).get();
    const fromModule = ((graphic?.data as { imagePrompts?: ImageRequest[] } | undefined)?.imagePrompts ?? []).filter((p) => p.purpose !== "key_visual");
    requests = [
      { purpose: "key_visual", prompt: b.keyVisual.imagePrompt, size: "1664*928", title: "Key visual" },
      ...b.moodboardPrompts.slice(0, 4).map((p) => ({ purpose: "moodboard" as const, prompt: p, size: "1328*1328" })),
      ...fromModule.slice(0, 3),
    ];
  }

  // palette e tono della bible guidano tutte le immagini
  const bible = latestBible(projectId)?.data as unknown as BibleData | undefined;
  const style = bible ? ` Palette: ${bible.palette.map((p) => p.hex).join(", ")}. Atmosfera: ${bible.toneWords.join(", ")}. Fotografia professionale per un evento corporate, nessun testo nell'immagine.` : "";

  ensureDataDirs();
  const saved: string[] = [];
  for (const [i, req] of requests.entries()) {
    throwIfCancelled(ctx.signal);
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
    const rel = path.join("images", `${id}.png`);
    fs.writeFileSync(dataPath(rel), buffer);
    const [w, h] = req.size.split("*").map(Number);
    db.insert(schema.imageAssets)
      .values({ id, projectId, purpose: req.purpose, prompt: req.prompt, negativePrompt: NEGATIVE, model: res.model, size: req.size, seed, path: rel, width: w, height: h, runId: ctx.runId })
      .run();
    saved.push(id);
  }
  // se non c'è ancora un key visual scelto, si sceglie il primo generato
  const hasSelected = db.select().from(schema.imageAssets).where(and(eq(schema.imageAssets.projectId, projectId), eq(schema.imageAssets.selected, true))).get();
  const firstKv = db.select().from(schema.imageAssets).where(and(eq(schema.imageAssets.projectId, projectId), eq(schema.imageAssets.purpose, "key_visual"))).get();
  if (!hasSelected && firstKv) db.update(schema.imageAssets).set({ selected: true }).where(eq(schema.imageAssets.id, firstKv.id)).run();
  return { images: saved.length };
};
