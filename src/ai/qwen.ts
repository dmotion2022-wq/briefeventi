import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { z } from "zod";
import { envValue, maskSecret, readEnvFileValue } from "../lib/env-file";
import { toStrictJsonSchema } from "./json-schema";

// Unico punto di contatto con Alibaba Model Studio (DashScope, regione internazionale).
// - compatible-mode (SDK openai): chat, output strutturato, OCR
// - API nativa DashScope: ricerca web con fonti, generazione di immagini

export class AiConfigError extends Error {}

export type Usage = { inputTokens: number; outputTokens: number; cachedTokens: number };
const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cachedTokens: 0 });

// Chiave e indirizzo si rileggono da .env.local a ogni chiamata (vedi env-file.ts): la chiave
// incollata da Impostazioni vale subito anche nel worker, senza riavviare.
function config() {
  const apiKey = envValue("DASHSCOPE_API_KEY");
  const baseUrl = (envValue("DASHSCOPE_BASE_URL") || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
  if (!apiKey) {
    throw new AiConfigError("Manca la chiave Qwen: incollala in Impostazioni (serve una volta sola).");
  }
  return { apiKey, baseUrl };
}

export const hasApiKey = () => !!envValue("DASHSCOPE_API_KEY");

/** Stato della chiave per la pagina Impostazioni: mai il valore intero. */
export function apiKeyStatus() {
  const fromFile = readEnvFileValue("DASHSCOPE_API_KEY");
  const fromEnv = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  const key = fromFile || fromEnv;
  return { present: !!key, masked: key ? maskSecret(key) : "", source: fromFile ? ("file" as const) : fromEnv ? ("env" as const) : null };
}

let client: { id: string; openai: OpenAI } | undefined;
export function openai() {
  const { apiKey, baseUrl } = config();
  const id = `${baseUrl}|${apiKey}`;
  // il client si ricrea se cambiano chiave o indirizzo
  if (client?.id !== id) {
    client = { id, openai: new OpenAI({ apiKey, baseURL: `${baseUrl}/compatible-mode/v1`, timeout: 10 * 60_000, maxRetries: 2 }) };
  }
  return client.openai;
}

function usageFrom(u: OpenAI.Completions.CompletionUsage | undefined | null): Usage {
  if (!u) return emptyUsage();
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cachedTokens: a.cachedTokens + b.cachedTokens,
});

// I modelli Qwen3.x ragionano per impostazione predefinita anche se non lo si chiede: prova del 2026-10-02
// su qwen3.8-max, estrazione JSON minima in 16,6 s (85% dei token di ragionamento nascosto) contro 2,2 s
// con lo stesso risultato. Su un brief intero erano minuti fermi al 15%. Il ragionamento quindi si chiede o
// si spegne sempre in modo esplicito; un modello che rifiuta il parametro lo perde alla prima risposta 400.
const noThinkingParam = new Set<string>();
const thinkingParam = (model: string, on: boolean) => (noThinkingParam.has(model) ? {} : { enable_thinking: on });
function rejectsThinkingParam(model: string, err: Error) {
  if (noThinkingParam.has(model) || !/enable_thinking/i.test(err.message)) return false;
  noThinkingParam.add(model);
  return true;
}

export type StreamProgress = { phase: "reasoning" | "writing"; chars: number };
type ChunkStream = AsyncIterable<ChatCompletionChunk> & { controller: AbortController };

// Se il modello non manda nulla per due minuti la richiesta si chiude: meglio un errore chiaro di un'attesa senza fine.
const STALL_MS = 120_000;

/** Legge uno stream di chat: testo, ragionamento e uso dei token, avvisando a ogni pezzo ricevuto. */
export async function readStream(stream: ChunkStream, onProgress?: (p: StreamProgress) => void, stallMs = STALL_MS) {
  let text = "";
  let reasoning = "";
  let usage = emptyUsage();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      stream.controller.abort();
    }, stallMs);
  };
  arm();
  try {
    for await (const chunk of stream) {
      arm();
      const delta = chunk.choices[0]?.delta as { content?: string | null; reasoning_content?: string | null } | undefined;
      if (delta?.reasoning_content) {
        reasoning += delta.reasoning_content;
        onProgress?.({ phase: "reasoning", chars: reasoning.length });
      }
      if (delta?.content) {
        text += delta.content;
        onProgress?.({ phase: "writing", chars: text.length });
      }
      if (chunk.usage) usage = usageFrom(chunk.usage);
    }
  } catch (err) {
    if (stalled) throw new Error(`Qwen non risponde da ${Math.round(stallMs / 1000)} secondi: riprova tra poco.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  return { text, reasoning, usage };
}

/** Estrae il JSON da una risposta, togliendo eventuali recinti ```json. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start !== -1 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("La risposta del modello non contiene JSON valido");
  }
}

// Modelli che hanno rifiutato json_schema: si passa a json_object con lo schema nel prompt.
const jsonObjectOnly = new Set<string>();

function formatZodIssues(error: z.ZodError) {
  // con il valore ricevuto si capisce subito se il modello ha sbagliato o se il campo mancava
  const received = (input: unknown) => (input === undefined ? "mancante" : JSON.stringify(input).slice(0, 80));
  return error.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(radice)"}: ${i.message} (ricevuto: ${received(i.input)})`)
    .join("\n");
}

export async function chatJson<T>(opts: {
  model: string;
  messages: ChatCompletionMessageParam[];
  schema: z.ZodType<T>;
  schemaName: string;
  signal?: AbortSignal;
  temperature?: number;
  /** Chiamata mentre il modello scrive, con i caratteri ricevuti finora. */
  onText?: (chars: number) => void;
}): Promise<{ data: T; usage: Usage; raw: string; mode: "json_schema" | "json_object" }> {
  const jsonSchema = toStrictJsonSchema(opts.schema);
  let usage = emptyUsage();

  const call = async (messages: ChatCompletionMessageParam[]): Promise<{ content: string; mode: "json_schema" | "json_object" }> => {
    const useObject = jsonObjectOnly.has(opts.model);
    const finalMessages: ChatCompletionMessageParam[] = useObject
      ? [
          ...messages,
          {
            role: "user",
            content: `Rispondi solo con un oggetto JSON valido conforme a questo JSON Schema:\n${JSON.stringify(jsonSchema)}`,
          },
        ]
      : messages;
    // in streaming: l'avanzamento si vede e un modello muto si interrompe; niente ragionamento nascosto
    const body = {
      model: opts.model,
      messages: finalMessages,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...thinkingParam(opts.model, false),
      response_format: useObject
        ? { type: "json_object" as const }
        : { type: "json_schema" as const, json_schema: { name: opts.schemaName, strict: true, schema: jsonSchema } },
      stream: true,
      stream_options: { include_usage: true },
    } as ChatCompletionCreateParamsStreaming;
    try {
      const stream = await openai().chat.completions.create(body, { signal: opts.signal });
      const res = await readStream(stream, (p) => p.phase === "writing" && opts.onText?.(p.chars));
      usage = addUsage(usage, res.usage);
      return { content: res.text, mode: useObject ? "json_object" : "json_schema" };
    } catch (err) {
      if (err instanceof OpenAI.BadRequestError) {
        // Se il modello non accetta json_schema, si ripiega su json_object una volta per tutte.
        if (!useObject && /response_format|json_schema/i.test(err.message)) {
          jsonObjectOnly.add(opts.model);
          return call(messages);
        }
        if (rejectsThinkingParam(opts.model, err)) return call(messages);
      }
      throw err;
    }
  };

  let { content, mode } = await call(opts.messages);
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed: unknown;
    let problem: string;
    try {
      parsed = extractJson(content);
      const result = opts.schema.safeParse(parsed, { reportInput: true });
      if (result.success) return { data: result.data, usage, raw: content, mode };
      problem = formatZodIssues(result.error);
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
    }
    if (attempt === 1) throw new Error(`Output non valido dopo la correzione:\n${problem}`);
    // Un solo tentativo di riparazione, con gli errori esatti.
    ({ content, mode } = await call([
      ...opts.messages,
      { role: "assistant", content },
      {
        role: "user",
        content: `Il JSON non rispetta lo schema richiesto:\n${problem}\nRestituisci di nuovo l'intero oggetto JSON corretto, senza commenti.`,
      },
    ]));
  }
  throw new Error("unreachable");
}

/** Testo libero, sempre in streaming. Il ragionamento si accende solo con thinking=true (allora senza temperatura). */
export async function chatText(opts: {
  model: string;
  messages: ChatCompletionMessageParam[];
  signal?: AbortSignal;
  temperature?: number;
  thinking?: boolean;
  onProgress?: (p: StreamProgress) => void;
}): Promise<{ text: string; reasoning: string; usage: Usage }> {
  const send = async (): Promise<{ text: string; reasoning: string; usage: Usage }> => {
    // enable_thinking è un parametro DashScope non tipizzato nell'SDK openai
    const body = {
      model: opts.model,
      messages: opts.messages,
      ...(opts.temperature != null && !opts.thinking ? { temperature: opts.temperature } : {}),
      ...thinkingParam(opts.model, !!opts.thinking),
      stream: true,
      stream_options: { include_usage: true },
    } as ChatCompletionCreateParamsStreaming;
    try {
      const stream = await openai().chat.completions.create(body, { signal: opts.signal });
      return await readStream(stream, opts.onProgress);
    } catch (err) {
      if (err instanceof OpenAI.BadRequestError && rejectsThinkingParam(opts.model, err)) return send();
      throw err;
    }
  };
  return send();
}

/** OCR di un'immagine (pagina PDF renderizzata) con un modello vision. */
export async function ocrImage(opts: { model: string; pngBase64: string; signal?: AbortSignal }) {
  const res = await openai().chat.completions.create(
    {
      model: opts.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${opts.pngBase64}` } },
            {
              type: "text",
              text: "Trascrivi fedelmente tutto il testo della pagina, nell'ordine di lettura. Mantieni numeri di telefono, email e importi esattamente come appaiono.",
            },
          ],
        },
      ],
    },
    { signal: opts.signal },
  );
  return { text: res.choices[0]?.message?.content ?? "", usage: usageFrom(res.usage) };
}

// ── API nativa DashScope ─────────────────────────────────────────────────────

async function dashscope<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const { apiKey, baseUrl } = config();
  const res = await fetch(`${baseUrl}/api/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`DashScope ${res.status}: risposta non JSON (${text.slice(0, 200)})`);
  }
  if (!res.ok || (typeof json.code === "string" && json.code)) {
    throw new Error(`DashScope ${res.status}: ${json.code ?? ""} ${json.message ?? text.slice(0, 300)}`.trim());
  }
  return json as T;
}

export type SearchSource = { index: number; title: string; url: string; siteName?: string };

// I modelli multimodali (per esempio qwen3.7-plus) l'API nativa li accetta solo su multimodal-generation:
// sul text-generation rispondono "url error" (prova del 2026-10-02). Al primo errore di questo tipo si
// passa all'altro endpoint e lo si ricorda per quel modello.
const multimodalOnly = new Set<string>();

type NativeTextResponse = {
  output: {
    // stringa sull'endpoint testuale, parti { text } su quello multimodale
    choices?: { message: { content: string | { text?: string }[] } }[];
    text?: string;
    search_info?: { search_results?: { index: number; title: string; url: string; site_name?: string }[] };
  };
  usage?: { input_tokens?: number; output_tokens?: number; plugins?: { search?: { count?: number } } };
};

/** Domanda con ricerca web: restituisce testo con citazioni [n] e l'elenco delle fonti. */
export async function webSearch(opts: {
  model: string;
  system: string;
  query: string;
  searchOptions?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<{ text: string; sources: SearchSource[]; usage: Usage; searches: number }> {
  const multimodal = multimodalOnly.has(opts.model);
  const content = (text: string) => (multimodal ? [{ text }] : text);
  let json: NativeTextResponse;
  try {
    json = await dashscope<NativeTextResponse>(
      multimodal ? "services/aigc/multimodal-generation/generation" : "services/aigc/text-generation/generation",
      {
        model: opts.model,
        input: {
          messages: [
            { role: "system", content: content(opts.system) },
            { role: "user", content: content(opts.query) },
          ],
        },
        parameters: {
          result_format: "message",
          enable_search: true,
          // anche qui il modello ragionerebbe per impostazione predefinita (vedi thinkingParam)
          enable_thinking: false,
          search_options: { forced_search: true, enable_source: true, enable_citation: true, ...opts.searchOptions },
        },
      },
      opts.signal,
    );
  } catch (err) {
    if (!multimodal && err instanceof Error && /url error/i.test(err.message)) {
      multimodalOnly.add(opts.model);
      return webSearch(opts);
    }
    throw err;
  }
  const raw = json.output.choices?.[0]?.message.content;
  const text = (typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("")) ?? json.output.text ?? "";
  const sources = (json.output.search_info?.search_results ?? []).map((s) => ({
    index: s.index,
    title: s.title,
    url: s.url,
    siteName: s.site_name,
  }));
  return {
    text,
    sources,
    usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0, cachedTokens: 0 },
    searches: json.usage?.plugins?.search?.count ?? 1,
  };
}

type NativeImageResponse = {
  output: { choices?: { message: { content: { image?: string }[] } }[] };
  usage?: { image_count?: number; width?: number; height?: number };
};

/** Genera un'immagine con Qwen-Image. L'URL restituito scade in 24 ore: va scaricato subito. */
export async function generateImageUrl(opts: {
  model: string;
  prompt: string;
  negativePrompt?: string;
  size?: string;
  seed?: number;
  signal?: AbortSignal;
}): Promise<{ url: string; images: number }> {
  const json = await dashscope<NativeImageResponse>(
    "services/aigc/multimodal-generation/generation",
    {
      model: opts.model,
      input: { messages: [{ role: "user", content: [{ text: opts.prompt }] }] },
      parameters: {
        n: 1,
        watermark: false,
        prompt_extend: true,
        ...(opts.size ? { size: opts.size } : {}),
        ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      },
    },
    opts.signal,
  );
  const url = json.output.choices?.[0]?.message.content.find((c) => c.image)?.image;
  if (!url) throw new Error("Qwen-Image non ha restituito un'immagine");
  return { url, images: json.usage?.image_count ?? 1 };
}

export async function listModels(opts: { timeoutMs?: number } = {}): Promise<string[]> {
  const page = await openai().models.list(opts.timeoutMs ? { timeout: opts.timeoutMs, maxRetries: 0 } : undefined);
  const ids: string[] = [];
  for await (const m of page) ids.push(m.id);
  return ids.sort();
}

/** Richiesta minima (pochi token) per provare che chiave e modello rispondono. */
export async function pingModel(model: string) {
  await openai().chat.completions.create(
    { model, messages: [{ role: "user", content: "Rispondi solo: ok" }], max_tokens: 5, ...thinkingParam(model, false) } as ChatCompletionCreateParamsNonStreaming,
    { timeout: 30_000, maxRetries: 0 },
  );
}
