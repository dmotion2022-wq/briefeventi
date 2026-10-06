// Modalità riservata: prima dell'invio a Qwen il nome del cliente e i termini indicati
// diventano segnaposto; nelle risposte i segnaposto tornano ai valori originali.

export type Mask = { pairs: { term: string; token: string }[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildMask(clientName: string | null | undefined, terms: string[] | null | undefined): Mask {
  const all = [clientName, ...(terms ?? [])]
    .map((t) => t?.trim())
    .filter((t): t is string => !!t && t.length >= 2);
  // i termini più lunghi per primi, così "Acme Pharma" vince su "Acme"
  const unique = [...new Set(all)].sort((a, b) => b.length - a.length);
  return {
    pairs: unique.map((term, i) => ({ term, token: i === 0 && term === clientName?.trim() ? "[CLIENTE]" : `[RISERVATO_${i}]` })),
  };
}

export function maskText(text: string, mask: Mask) {
  return mask.pairs.reduce((acc, { term, token }) => acc.replace(new RegExp(escape(term), "gi"), token), text);
}

export function unmaskDeep<T>(value: T, mask: Mask): T {
  if (mask.pairs.length === 0) return value;
  if (typeof value === "string") {
    return mask.pairs.reduce((acc, { term, token }) => acc.split(token).join(term), value as string) as T;
  }
  if (Array.isArray(value)) return value.map((v) => unmaskDeep(v, mask)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmaskDeep(v, mask)])) as T;
  }
  return value;
}
