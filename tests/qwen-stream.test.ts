import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { readStream, type StreamProgress } from "@/ai/qwen";
import { streamMessage } from "@/worker/runs";

const chunk = (delta: { content?: string; reasoning_content?: string }, usage?: ChatCompletionChunk["usage"]) =>
  ({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", choices: usage ? [] : [{ index: 0, delta, finish_reason: null }], usage }) as ChatCompletionChunk;

function fakeStream(chunks: ChatCompletionChunk[] | "silent") {
  const controller = new AbortController();
  async function* gen() {
    if (chunks === "silent") {
      // un modello che non manda più nulla: si sblocca solo quando la richiesta viene chiusa
      await new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Request was aborted."))));
      return;
    }
    for (const c of chunks) yield c;
  }
  return Object.assign(gen(), { controller });
}

describe("lettura dello streaming di Qwen", () => {
  it("raccoglie testo, ragionamento e token e avvisa a ogni pezzo", async () => {
    const seen: StreamProgress[] = [];
    const res = await readStream(
      fakeStream([
        chunk({ reasoning_content: "penso" }),
        chunk({ content: '{"a":' }),
        chunk({ content: "1}" }),
        chunk({}, { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, prompt_tokens_details: { cached_tokens: 3 } }),
      ]),
      (p) => seen.push(p),
    );
    expect(res.text).toBe('{"a":1}');
    expect(res.reasoning).toBe("penso");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4, cachedTokens: 3 });
    expect(seen).toEqual([
      { phase: "reasoning", chars: 5 },
      { phase: "writing", chars: 5 },
      { phase: "writing", chars: 7 },
    ]);
  });

  it("chiude la richiesta e spiega l'errore se il modello resta muto", async () => {
    const stream = fakeStream("silent");
    await expect(readStream(stream, undefined, 50)).rejects.toThrow("Qwen non risponde da 0 secondi");
    expect(stream.controller.signal.aborted).toBe(true);
  });

  it("lascia passare gli altri errori, compreso l'annullamento dell'utente", async () => {
    const controller = new AbortController();
    async function* broken() {
      yield chunk({ content: "x" });
      throw new Error("Request was aborted.");
    }
    await expect(readStream(Object.assign(broken(), { controller }), undefined, 5_000)).rejects.toThrow("Request was aborted.");
  });
});

describe("messaggio di avanzamento", () => {
  it("aggiunge i caratteri al passo in corso e sostituisce l'aggiunta precedente", () => {
    // in italiano le migliaia si separano da cinque cifre in su (CLDR): 3456 ma 34.567
    expect(streamMessage("Analisi del brief con Qwen", { phase: "writing", chars: 34567 })).toBe(
      "Analisi del brief con Qwen · Qwen scrive: 34.567 caratteri",
    );
    expect(streamMessage("Analisi del brief con Qwen · Qwen scrive: 3456 caratteri", { phase: "reasoning", chars: 12 })).toBe(
      "Analisi del brief con Qwen · Qwen ragiona: 12 caratteri",
    );
    expect(streamMessage(null, { phase: "writing", chars: 1 })).toBe("Qwen scrive: 1 carattere");
  });
});
