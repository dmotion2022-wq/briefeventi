// Importi sempre in centesimi interi, percentuali in punti base (1% = 100 bp).

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const eurNoCents = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const pct = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export const formatCents = (cents: number | null | undefined, opts?: { noCents?: boolean }) =>
  cents == null ? "—" : (opts?.noCents ? eurNoCents : eur).format(cents / 100);

export const formatBp = (bp: number | null | undefined) => (bp == null ? "—" : `${pct.format(bp / 100)}%`);

export const percentToBp = (percent: number) => Math.round(percent * 100);
export const bpToPercent = (bp: number) => bp / 100;
export const eurosToCents = (euros: number) => Math.round(euros * 100);

/**
 * Converte un importo scritto all'italiana in centesimi.
 * "€ 8.450,00" → 845000 · "6.512,81" → 651281 · "1200" → 120000 · "1.200" → 120000.
 * Restituisce null se il testo non contiene un importo riconoscibile.
 */
export function parseItalianAmount(input: string | null | undefined): number | null {
  if (!input) return null;
  const match = input.replace(/\s/g, "").match(/-?\d[\d.,]*/);
  if (!match) return null;
  let s = match[0];
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    // virgola decimale: i punti sono separatori delle migliaia
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma === -1) {
    // solo punti: decimali se seguiti da 1-2 cifre finali, altrimenti migliaia
    const decimals = s.length - lastDot - 1;
    s = decimals > 0 && decimals <= 2 && s.split(".").length === 2 ? s : s.replace(/\./g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  const value = Number(s);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
