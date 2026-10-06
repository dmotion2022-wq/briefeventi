// Controllo delle citazioni restituite dall'AI: la frase deve esistere davvero nel documento.

export type PageText = { pageNumber: number; text: string };

export const normalizeForMatch = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9€%]+/g, " ")
    .trim();

/**
 * Cerca la citazione prima nella pagina indicata, poi in tutte. Accetta piccole differenze di
 * impaginazione (a capo, punteggiatura) ma non parafrasi: almeno l'80% delle sequenze di 5 parole
 * della citazione deve comparire nella pagina.
 */
export function verifyQuote(quote: string | null | undefined, pages: PageText[], statedPage?: number | null) {
  if (!quote) return { verified: false, page: null as number | null };
  const nq = normalizeForMatch(quote);
  if (nq.length < 8) return { verified: false, page: null as number | null };
  const ordered = [...pages].sort((a, b) => (a.pageNumber === statedPage ? -1 : b.pageNumber === statedPage ? 1 : 0));
  const words = nq.split(" ");
  const windows: string[] = [];
  for (let i = 0; i + 5 <= words.length; i++) windows.push(words.slice(i, i + 5).join(" "));

  for (const page of ordered) {
    const np = normalizeForMatch(page.text);
    if (np.includes(nq)) return { verified: true, page: page.pageNumber };
    if (windows.length >= 2) {
      const hits = windows.filter((w) => np.includes(w)).length;
      if (hits / windows.length >= 0.8) return { verified: true, page: page.pageNumber };
    }
  }
  return { verified: false, page: null as number | null };
}
