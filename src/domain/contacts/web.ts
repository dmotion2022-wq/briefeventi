import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import { extractEmails, extractPhones, normalizePhone } from "./phone";

// Verifica dei contatti sul sito ufficiale: si scarica la pagina, se ne salva una copia come
// prova e si cercano i numeri nel testo, nei link tel: e nei dati strutturati (JSON-LD).

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", egrave: "è", eacute: "é", agrave: "à", ograve: "ò", igrave: "ì", ugrave: "ù" };

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCharCode(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCharCode(Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function telLinks(html: string) {
  return [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]).trim());
}

export function mailtoLinks(html: string) {
  return [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => decodeURIComponent(m[1]).trim().toLowerCase());
}

export function jsonLdPhones(html: string) {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"telephone"\s*:\s*"([^"]+)"/g)) out.push(t[1]);
  }
  return out;
}

export type PagePhones = { e164: string; snippet: string; how: "testo" | "link tel" | "dati strutturati" };

/** Telefoni presenti in una pagina: testo con etichetta, link tel: e JSON-LD (questi ultimi sono telefoni per definizione). */
export function phonesInPage(html: string): { phones: PagePhones[]; emails: string[]; text: string } {
  const text = htmlToText(html);
  const phones = new Map<string, PagePhones>();
  for (const raw of telLinks(html)) {
    const e164 = normalizePhone(raw);
    if (e164 && !phones.has(e164)) phones.set(e164, { e164, snippet: `link tel:${raw}`, how: "link tel" });
  }
  for (const raw of jsonLdPhones(html)) {
    const e164 = normalizePhone(raw);
    if (e164 && !phones.has(e164)) phones.set(e164, { e164, snippet: `"telephone": "${raw}"`, how: "dati strutturati" });
  }
  for (const p of extractPhones(text)) if (!phones.has(p.e164)) phones.set(p.e164, { e164: p.e164, snippet: p.snippet, how: "testo" });
  const emails = [...new Set([...mailtoLinks(html), ...extractEmails(text).map((e) => e.value)])];
  return { phones: [...phones.values()], emails, text };
}

export type FetchedPage = { url: string; html: string; evidencePath: string };

/** Scarica una pagina (timeout e limite di dimensione) e ne salva una copia come prova. */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) EventStudio/1.0", "Accept-Language": "it,en;q=0.8" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    const html = buf.toString("utf8");
    ensureDataDirs();
    const name = `${crypto.createHash("sha256").update(res.url + html).digest("hex").slice(0, 24)}.html`;
    const rel = path.join("evidence", name);
    fs.writeFileSync(dataPath(rel), `<!-- fonte: ${res.url} · scaricata il ${new Date().toISOString()} -->\n${html}`);
    return { url: res.url, html, evidencePath: rel };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const CONTACT_PATHS = ["", "/contatti", "/contatti/", "/contacts", "/contact", "/contact-us", "/it/contatti", "/chi-siamo"];

/** Home e pagine contatti del sito: prima pagina con telefoni trovati vince, ma si raccolgono tutte le prove. */
export async function crawlContacts(website: string, signal?: AbortSignal) {
  let origin: string;
  try {
    origin = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).origin;
  } catch {
    return { pages: [] as { url: string; evidencePath: string; phones: PagePhones[]; emails: string[] }[] };
  }
  const pages: { url: string; evidencePath: string; phones: PagePhones[]; emails: string[] }[] = [];
  const seen = new Set<string>();
  for (const p of CONTACT_PATHS) {
    if (pages.length >= 3) break;
    const page = await fetchPage(`${origin}${p}`, signal);
    if (!page || seen.has(page.url)) continue;
    seen.add(page.url);
    const found = phonesInPage(page.html);
    pages.push({ url: page.url, evidencePath: page.evidencePath, phones: found.phones, emails: found.emails });
  }
  return { pages };
}
