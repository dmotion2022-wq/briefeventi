import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { z } from "zod";
import { getSetting } from "@/lib/settings";
import type { ModelTier } from "@/lib/settings-defaults";
import { recordAiCall, streamReporter } from "@/worker/runs";
import { maskText, unmaskDeep, type Mask } from "./mask";
import { chatJson, chatText, generateImageUrl, ocrImage, webSearch, type Usage } from "./qwen";

// Livello alto usato dalle pipeline: sceglie il modello per livello, applica la modalità
// riservata e registra ogni chiamata con token e costo stimato.

export type AiCallContext = {
  task: string;
  runId?: string | null;
  projectId?: string | null;
  signal?: AbortSignal;
  mask?: Mask;
};

export const modelFor = async (tier: ModelTier) => (await getSetting("ai.models"))[tier];

/** Costo stimato in micro-euro a partire dai prezzi in USD delle Impostazioni. */
export async function costMicros(model: string, usage: Usage, extra: { calls?: number; images?: number } = {}) {
  const price = (await getSetting("ai.prices"))[model];
  if (!price) return 0;
  const fx = await getSetting("ai.usdToEur");
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens);
  const usd =
    (uncached / 1e6) * (price.inputPerMTok ?? 0) +
    (usage.cachedTokens / 1e6) * (price.cachedInputPerMTok ?? price.inputPerMTok ?? 0) +
    (usage.outputTokens / 1e6) * (price.outputPerMTok ?? 0) +
    ((extra.calls ?? 0) / 1000) * (price.perThousandCalls ?? 0) +
    (extra.images ?? 0) * (price.perImage ?? 0);
  return Math.round(usd * fx * 1e6);
}

async function record(
  ctx: AiCallContext,
  model: string,
  kind: "chat" | "search" | "image" | "ocr",
  usage: Usage,
  started: number,
  extra: { calls?: number; images?: number; error?: string } = {},
) {
  const durationMs = Date.now() - started;
  await recordAiCall({
    runId: ctx.runId ?? null,
    projectId: ctx.projectId ?? null,
    task: ctx.task,
    model,
    kind,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedTokens,
    units: extra.images ?? extra.calls ?? 0,
    costMicros: await costMicros(model, usage, extra),
    durationMs,
    ok: !extra.error,
    error: extra.error ?? null,
  });
}

const maskMessages = (messages: ChatCompletionMessageParam[], mask?: Mask): ChatCompletionMessageParam[] =>
  !mask || mask.pairs.length === 0
    ? messages
    : messages.map((m) => (typeof m.content === "string" ? ({ ...m, content: maskText(m.content, mask) } as typeof m) : m));

/**
 * Oggetto strutturato validato con zod. Con il ragionamento attivo per il livello
 * scelto, lavora in due passi: bozza ragionata, poi strutturazione con il modello flash.
 */
export async function generateObject<T>(
  ctx: AiCallContext,
  opts: {
    tier?: ModelTier;
    schema: z.ZodType<T>;
    schemaName: string;
    system: string;
    prompt: string;
    temperature?: number;
  },
): Promise<T> {
  const tier = opts.tier ?? "max";
  const model = await modelFor(tier);
  const thinking = (await getSetting("ai.thinking"))[tier] ?? false;
  const report = streamReporter(ctx.runId);
  let messages = maskMessages(
    [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    ctx.mask,
  );

  if (thinking) {
    const started = Date.now();
    const draft = await chatText({ model, messages, signal: ctx.signal, thinking: true, temperature: opts.temperature, onProgress: report });
    await record(ctx, model, "chat", draft.usage, started);
    messages = [
      ...messages,
      { role: "assistant", content: draft.text },
      { role: "user", content: "Riporta la risposta qui sopra nel formato JSON richiesto, senza cambiarne il contenuto." },
    ];
  }

  const structModel = thinking ? await modelFor("flash") : model;
  const started = Date.now();
  try {
    const { data, usage } = await chatJson({
      model: structModel,
      messages,
      schema: opts.schema,
      schemaName: opts.schemaName,
      signal: ctx.signal,
      temperature: thinking ? 0 : opts.temperature,
      onText: (chars) => report({ phase: "writing", chars }),
    });
    await record(ctx, structModel, "chat", usage, started);
    return ctx.mask ? unmaskDeep(data, ctx.mask) : data;
  } catch (err) {
    await record(ctx, structModel, "chat", { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, started, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Testo libero (email, note). */
export async function generateText(
  ctx: AiCallContext,
  opts: { tier?: ModelTier; system: string; prompt: string; temperature?: number },
) {
  const model = await modelFor(opts.tier ?? "flash");
  const started = Date.now();
  const res = await chatText({
    model,
    messages: maskMessages(
      [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      ctx.mask,
    ),
    signal: ctx.signal,
    temperature: opts.temperature,
    onProgress: streamReporter(ctx.runId),
  });
  await record(ctx, model, "chat", res.usage, started);
  return ctx.mask ? unmaskDeep(res.text, ctx.mask) : res.text;
}

export async function searchWeb(ctx: AiCallContext, opts: { system: string; query: string }) {
  const model = await modelFor("search");
  const started = Date.now();
  const res = await webSearch({ model, system: opts.system, query: opts.query, signal: ctx.signal });
  await record(ctx, model, "search", res.usage, started, { calls: res.searches });
  return res;
}

export async function makeImage(
  ctx: AiCallContext,
  opts: { pro?: boolean; prompt: string; negativePrompt?: string; size?: string; seed?: number },
) {
  const model = await modelFor(opts.pro ? "image_pro" : "image");
  const started = Date.now();
  const res = await generateImageUrl({ model, ...opts, signal: ctx.signal });
  await record(ctx, model, "image", { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, started, { images: res.images });
  return { ...res, model };
}

export async function ocrPage(ctx: AiCallContext, pngBase64: string) {
  const model = await modelFor("ocr");
  const started = Date.now();
  const res = await ocrImage({ model, pngBase64, signal: ctx.signal });
  await record(ctx, model, "ocr", res.usage, started);
  return res.text;
}
