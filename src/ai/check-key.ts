import { describeAiError, isAuthError } from "./errors";
import { AiConfigError, listModels, pingModel } from "./qwen";

export type KeyCheck = { ok: boolean; message: string };

/**
 * Prova la chiave salvata: l'elenco dei modelli (non costa nulla) e, se l'endpoint non lo offre,
 * una richiesta minima. Segnala i nomi di modello impostati che non compaiono nell'elenco.
 */
export async function checkApiKey(pingModelId: string, configured: string[]): Promise<KeyCheck> {
  try {
    const ids = await listModels({ timeoutMs: 20_000 });
    const missing = [...new Set(configured)].filter((m) => !ids.includes(m));
    if (!missing.length) return { ok: true, message: `Chiave valida: ${ids.length} modelli disponibili, compresi tutti quelli impostati.` };
    return {
      ok: true,
      message: `Chiave valida (${ids.length} modelli disponibili). Nell'elenco non compaiono: ${missing.join(", ")}. Per i modelli di immagine può essere normale; per gli altri controlla il nome in "Modelli e prezzi".`,
    };
  } catch (err) {
    if (err instanceof AiConfigError || isAuthError(err)) return { ok: false, message: describeAiError(err) };
    try {
      await pingModel(pingModelId);
      return { ok: true, message: "Chiave valida: la richiesta di prova è andata a buon fine (l'elenco dei modelli non è disponibile)." };
    } catch (pingErr) {
      return { ok: false, message: describeAiError(pingErr) };
    }
  }
}
