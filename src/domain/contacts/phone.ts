import { findPhoneNumbersInText, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

// Regola fissa del tool: un telefono è "verificato" solo se compare nella fonte
// (testo del PDF o pagina web scaricata). Qui stanno le funzioni pure che lo controllano.

export type FoundPhone = {
  e164: string;
  display: string;
  type: "phone" | "mobile";
  start: number;
  end: number;
  snippet: string;
};

export type FoundEmail = { value: string; start: number; end: number; snippet: string };

export function snippetAround(text: string, start: number, end: number, radius = 60) {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ").trim()}${to < text.length ? "…" : ""}`;
}

/** Normalizza un numero in E.164 (+390212345678). Null se non è un numero valido. */
export function normalizePhone(raw: string, defaultCountry: CountryCode = "IT"): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry);
  return parsed && parsed.isValid() ? parsed.number : null;
}

export function phoneType(e164: string): "phone" | "mobile" {
  const t = parsePhoneNumberFromString(e164)?.getType();
  return t === "MOBILE" ? "mobile" : "phone";
}

export function formatPhoneDisplay(e164: string) {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === "IT" ? parsed.formatNational() : parsed.formatInternational();
}

// Etichette che annunciano un telefono subito prima del numero…
const PHONE_LABEL =
  /(?:^|[^a-z])(?:tel|telefono|phone|ph|t|cell|cellulare|mobile|mob|whatsapp|wa|centralino|reception|hotline|numero verde|n\. verde|contatti|contact|call|chiama(?:ci)?|prenotazioni|booking|info)\s*[.:\-–]?\s*(?:\(.{0,12}\))?\s*$/i;
// …e quelle che indicano un altro tipo di numero (da scartare).
const NOT_PHONE_LABEL =
  /(?:p\.?\s?iva|partita\s+iva|c\.?\s?f\.?|codice\s+fiscale|vat(?:\s+n(?:o|umber)?\.?)?|fax|iban|rea|cap|c\.a\.p\.|cod(?:ice)?\.?|reg(?:istro)?\.?|iscr(?:izione)?\.?|n\.\s*reg|capitale|cin|cir|tax\s*id)\s*[.:\-–]?\s*(?:e\s+c\.?\s?f\.?\s*)?[.:\-–]?\s*$/i;

/**
 * Accetta un numero solo se il contesto dice che è un telefono: etichetta subito prima,
 * prefisso internazionale scritto, oppure cellulare con la classica spaziatura.
 * Scarta numeri preceduti da P.IVA, C.F., fax, IBAN, REA ecc. (e quindi tabelle e codici).
 */
export function looksLikePhoneInContext(text: string, start: number, end: number, isMobile: boolean) {
  const before = text.slice(Math.max(0, start - 32), start);
  if (NOT_PHONE_LABEL.test(before)) return false;
  if (PHONE_LABEL.test(before)) return true;
  const raw = text.slice(start, end).trim();
  if (/^(\+|00)\d/.test(raw)) return true;
  return isMobile && /^3\d{2}[\s.\-]?\d{3}[\s.\-]?\d{3,4}$/.test(raw.replace(/^\(?\+?39\)?\s*/, ""));
}

/** Tutti i telefoni validi presenti in un testo, con il frammento di contesto. */
export function extractPhones(text: string, defaultCountry: CountryCode = "IT"): FoundPhone[] {
  const seen = new Set<string>();
  const out: FoundPhone[] = [];
  for (const m of findPhoneNumbersInText(text, { defaultCountry })) {
    if (!m.number.isValid()) continue;
    if (!looksLikePhoneInContext(text, m.startsAt, m.endsAt, m.number.getType() === "MOBILE")) continue;
    const e164 = m.number.number;
    if (seen.has(e164)) continue;
    seen.add(e164);
    out.push({
      e164,
      display: text.slice(m.startsAt, m.endsAt),
      type: m.number.getType() === "MOBILE" ? "mobile" : "phone",
      start: m.startsAt,
      end: m.endsAt,
      snippet: snippetAround(text, m.startsAt, m.endsAt),
    });
  }
  return out;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractEmails(text: string): FoundEmail[] {
  const seen = new Set<string>();
  const out: FoundEmail[] = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const value = m[0].toLowerCase().replace(/\.+$/, "");
    if (seen.has(value) || /\.(png|jpe?g|gif|webp|svg)$/.test(value)) continue;
    seen.add(value);
    const start = m.index ?? 0;
    out.push({ value, start, end: start + m[0].length, snippet: snippetAround(text, start, start + m[0].length) });
  }
  return out;
}

/**
 * Controlla che il numero (in qualunque formato) compaia nella fonte.
 * Confronta i numeri riconosciuti nel testo e, in più, le sole cifre del numero nazionale
 * (copre formati spezzati come "02.123 45 678").
 */
export function sourceContainsPhone(sourceText: string, phone: string, defaultCountry: CountryCode = "IT") {
  const target = normalizePhone(phone, defaultCountry);
  if (!target) return { found: false as const };
  const hit = extractPhones(sourceText, defaultCountry).find((p) => p.e164 === target);
  if (hit) return { found: true as const, e164: target, snippet: hit.snippet };

  const national = parsePhoneNumberFromString(target)?.nationalNumber;
  if (national && national.length >= 6) {
    const digitsOnly = sourceText.replace(/\D/g, "");
    if (digitsOnly.includes(national)) return { found: true as const, e164: target, snippet: undefined };
  }
  return { found: false as const, e164: target };
}
