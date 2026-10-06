// Messaggi in italiano per gli errori delle chiamate a DashScope: sia quelli dell'SDK openai
// (hanno `status`) sia quelli dell'API nativa, che arrivano come "DashScope 401: …".

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status;
  const native = err instanceof Error ? /DashScope (\d{3})/.exec(err.message) : null;
  return native ? Number(native[1]) : undefined;
}

export const isAuthError = (err: unknown) => [401, 403].includes(statusOf(err) ?? 0);

const clip = (text: string) => (text.length > 300 ? `${text.slice(0, 300)}…` : text);

export function describeAiError(err: unknown): string {
  const status = statusOf(err);
  const message = err instanceof Error ? err.message : String(err);
  if (isAuthError(err)) {
    return "Alibaba rifiuta la chiave (errore 401/403). Controlla di averla copiata per intero e che sia una chiave della regione internazionale (Singapore), non della Cina.";
  }
  if (status === 429) return "Troppe richieste o credito esaurito (errore 429): controlla saldo e limiti su Model Studio.";
  if (status === 404) return `Modello o indirizzo non trovato (errore 404): ${clip(message)}`;
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|Connection error|timed out/i.test(message)) {
    return "Non riesco a raggiungere Alibaba: controlla la connessione a internet.";
  }
  return clip(message);
}
