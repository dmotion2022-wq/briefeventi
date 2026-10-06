// Punteggi della "commissione di gara": il modello dà i voti 1-10 per criterio,
// la media pesata la calcola il codice (riproducibile, niente aritmetica affidata all'AI).

export type Rubric = { criterion: string; weight: number }[];
export type CriterionScore = { criterion: string; score: number };

/** Media pesata su base 10, restituita in punti base (10/10 = 10000). */
export function weightedScoreBp(scores: CriterionScore[], rubric: Rubric): number {
  const byCriterion = new Map(scores.map((s) => [s.criterion, Math.max(1, Math.min(10, s.score))]));
  let total = 0;
  let weights = 0;
  for (const { criterion, weight } of rubric) {
    const score = byCriterion.get(criterion);
    if (score == null || weight <= 0) continue;
    total += score * weight;
    weights += weight;
  }
  return weights ? Math.round((total / weights) * 1000) : 0;
}

/** Ordine mescolato ma riproducibile (dato un seme) per anonimizzare i concept da valutare. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Rubrica dai criteri della gara (pesi normalizzati), o quella standard se mancano. */
export function rubricFrom(criteria: { criterion: string; weight: number | null }[] | undefined, fallback: Rubric): Rubric {
  const valid = (criteria ?? []).filter((c) => c.criterion?.trim());
  if (!valid.length) return fallback;
  const hasWeights = valid.some((c) => c.weight && c.weight > 0);
  return valid.map((c) => ({ criterion: c.criterion.trim(), weight: hasWeights ? Math.max(0, c.weight ?? 0) : 1 }));
}
