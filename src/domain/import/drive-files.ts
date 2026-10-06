import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createDocument, documentPages, type DocumentKind } from "@/domain/documents";
import { extractEmails, extractPhones, formatPhoneDisplay } from "@/domain/contacts/phone";
import { newId } from "@/lib/ids";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import type { DriveSource } from "@/lib/settings-defaults";
import { usesBlob } from "@/lib/storage";
import { sourceKeyFor } from "./normalize";

// Download dei PDF dalle cartelle pubbliche del Drive, testo per pagina e contatti trovati
// nel testo (telefono/email con pagina e frammento come prova: verificati per costruzione).

export type DriveEntry = { id: string; name: string };
type FolderKey = "works" | "location" | "budgets";

const KIND_BY_FOLDER: Record<FolderKey, DocumentKind> = {
  works: "past_work",
  location: "venue_brochure",
  budgets: "supplier_quote",
};

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Elenco dei file di una cartella condivisa con link (pagina pubblica, senza chiavi API). */
export async function listPublicFolder(folderId: string, signal?: AbortSignal): Promise<DriveEntry[]> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, { signal });
  if (!res.ok) throw new Error(`Cartella Drive non leggibile (HTTP ${res.status})`);
  const html = await res.text();
  const entries: DriveEntry[] = [];
  const re = /id="entry-([A-Za-z0-9_-]+)"[\s\S]*?class="flip-entry-title">([^<]*)</g;
  for (const m of html.matchAll(re)) entries.push({ id: m[1], name: decodeEntities(m[2]).trim() });
  return entries;
}

/** Scarica un file pubblico. Sul Mac tiene una cache per ID (un nuovo import non riscarica nulla). */
export async function downloadDriveFile(id: string, signal?: AbortSignal): Promise<Buffer> {
  // in cloud niente cache: il PDF finisce comunque nell'archivio dei documenti
  if (usesBlob() || process.env.VERCEL) return fetchDriveFile(id, signal);
  const cached = dataPath("cache", "drive", `${id}.pdf`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const buffer = await fetchDriveFile(id, signal);
  ensureDataDirs();
  fs.writeFileSync(cached, buffer);
  return buffer;
}

async function fetchDriveFile(id: string, signal?: AbortSignal): Promise<Buffer> {
  const url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(`Download non riuscito (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Il file scaricato non è un PDF (cartella non più pubblica o file non condiviso?)");
  }
  return buffer;
}

/** Legge un file dalla cartella sincronizzata con Google Drive per desktop, se configurata. */
function readLocal(localRoot: string, folder: FolderKey, name: string): Buffer | null {
  if (!localRoot) return null;
  const sub = { works: "WORKS", location: "LOCATIONS / HOTEL", budgets: "BUDGETS" }[folder];
  // cartella scelta da chi usa l'app sul Mac: fuori dal pacchetto del server (turbopackIgnore)
  for (const candidate of [
    path.join(/*turbopackIgnore: true*/ localRoot, sub, name),
    path.join(/*turbopackIgnore: true*/ localRoot, sub.replace(" / ", "_"), name),
  ]) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) return fs.readFileSync(/*turbopackIgnore: true*/ candidate);
  }
  return null;
}

const WEBSITE_RE = /\b((?:https?:\/\/)?(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:\/[^\s)]*)?/gi;
const IGNORED_DOMAINS = /(google|facebook|instagram|linkedin|youtube|twitter|x\.com|tiktok|vimeo|issuu|wetransfer)/i;

function mainWebsite(texts: string[], links: string[]): string | null {
  const counts = new Map<string, number>();
  const add = (raw: string) => {
    const host = raw.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    if (!host.includes(".") || IGNORED_DOMAINS.test(host)) return;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  };
  for (const l of links) if (/^https?:/i.test(l)) add(l);
  for (const t of texts) for (const m of t.matchAll(WEBSITE_RE)) add(m[1]);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0].replace(/^www\./, "") : null;
}

const MAX_CONTACTS_PER_TYPE = 10;

/** Contatti presenti nel testo del PDF, salvati sul fornitore con pagina e frammento. */
export async function contactsFromDocument(documentId: string, supplierId: string, links: string[] = []) {
  const db = getDb();
  const pages = await documentPages(documentId);
  let phones = 0;
  let emails = 0;
  const now = new Date().toISOString();

  // anche i link tel: e mailto: presenti nel PDF
  const linkText = links
    .filter((l) => /^(tel:|mailto:)/i.test(l))
    .map((l) => l.replace(/^tel:/i, "Tel. ").replace(/^mailto:/i, ""))
    .join("\n");
  const sources = [
    ...pages.map((p) => ({ page: p.pageNumber, text: p.text, ocr: p.textSource === "ocr" })),
    { page: 0, text: linkText, ocr: false },
  ];

  for (const { page, text, ocr } of sources) {
    if (!text) continue;
    // il testo letto con l'OCR può sbagliare una cifra: quei numeri restano da verificare
    const status = ocr ? ("to_verify" as const) : ("verified" as const);
    for (const p of extractPhones(text)) {
      if (phones >= MAX_CONTACTS_PER_TYPE) break;
      const inserted = await db
        .insert(schema.supplierContacts)
        .values({
          id: newId("cnt"),
          supplierId,
          type: p.type,
          value: p.e164,
          display: formatPhoneDisplay(p.e164),
          status,
          verificationMethod: "pdf_text",
          evidence: { documentId, page: page || undefined, snippet: ocr ? `[OCR] ${p.snippet}` : p.snippet },
          verifiedAt: ocr ? null : now,
        })
        .onConflictDoNothing()
        .run();
      phones += inserted.rowsAffected;
    }
    for (const e of extractEmails(text)) {
      if (emails >= MAX_CONTACTS_PER_TYPE) break;
      const inserted = await db
        .insert(schema.supplierContacts)
        .values({
          id: newId("cnt"),
          supplierId,
          type: "email",
          value: e.value,
          display: e.value,
          status,
          verificationMethod: "pdf_text",
          evidence: { documentId, page: page || undefined, snippet: ocr ? `[OCR] ${e.snippet}` : e.snippet },
          verifiedAt: ocr ? null : now,
        })
        .onConflictDoNothing()
        .run();
      emails += inserted.rowsAffected;
    }
  }

  const website = mainWebsite(
    pages.map((p) => p.text),
    links,
  );
  if (website) {
    const supplier = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplierId)).get();
    if (supplier && !supplier.website) {
      await db.update(schema.suppliers).set({ website: `https://${website}`, domain: website }).where(eq(schema.suppliers.id, supplierId)).run();
    }
  }
  return { phones, emails, website };
}

export type SyncReport = {
  listed: number;
  downloaded: number;
  reused: number;
  failed: { name: string; error: string }[];
  unindexed: string[];
  ocrNeeded: string[];
  contacts: { phones: number; emails: number };
  /** File lasciati per la prossima esecuzione (tempo della funzione cloud quasi finito). */
  pending?: number;
};

/** Scarica (o riusa) i PDF delle tre cartelle e li collega a proposte, venue e listino. */
export async function syncDriveFiles(
  source: DriveSource,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number, name: string) => void; shouldStop?: () => boolean } = {},
): Promise<SyncReport> {
  const db = getDb();
  const report: SyncReport = {
    listed: 0,
    downloaded: 0,
    reused: 0,
    failed: [],
    unindexed: [],
    ocrNeeded: [],
    contacts: { phones: 0, emails: 0 },
  };

  const folders: FolderKey[] = ["works", "location", "budgets"];
  const listing: { folder: FolderKey; entry: DriveEntry }[] = [];
  for (const folder of folders) {
    const entries = await listPublicFolder(source.folders[folder], opts.signal);
    for (const entry of entries.filter((e) => /\.pdf$/i.test(e.name))) listing.push({ folder, entry });
  }
  report.listed = listing.length;

  let done = 0;
  const processOne = async ({ folder, entry }: { folder: FolderKey; entry: DriveEntry }) => {
    try {
      const already = await db.select().from(schema.documents).where(eq(schema.documents.driveFileId, entry.id)).get();
      let documentId: string;
      let links: string[] = [];
      if (already) {
        documentId = already.id;
        report.reused++;
      } else {
        const buffer = readLocal(source.localPath, folder, entry.name) ?? (await downloadDriveFile(entry.id, opts.signal));
        const created = await createDocument({
          kind: KIND_BY_FOLDER[folder],
          filename: entry.name,
          buffer,
          mime: "application/pdf",
          driveFileId: entry.id,
          sourceUrl: `https://drive.google.com/file/d/${entry.id}/view`,
        });
        documentId = created.document.id;
        links = created.links;
        report.downloaded++;
        if (created.document.extractionStatus === "ocr_needed") report.ocrNeeded.push(entry.name);
      }

      // collegamento al record dell'indice: prima per ID Drive, poi per nome file
      const key = sourceKeyFor(entry.name);
      let supplierId: string | null = null;
      let matched = false;
      if (folder === "works") {
        const work =
          (await db.select().from(schema.referenceWorks).where(eq(schema.referenceWorks.driveFileId, entry.id)).get()) ??
          (await db.select().from(schema.referenceWorks).where(eq(schema.referenceWorks.sourceKey, key)).get());
        if (work) {
          matched = true;
          await db.update(schema.referenceWorks).set({ documentId }).where(eq(schema.referenceWorks.id, work.id)).run();
        }
      } else if (folder === "location") {
        const venue =
          (await db.select().from(schema.venues).where(eq(schema.venues.driveFileId, entry.id)).get()) ??
          (await db.select().from(schema.venues).where(eq(schema.venues.sourceKey, key)).get());
        if (venue) {
          matched = true;
          supplierId = venue.supplierId;
          await db.update(schema.venues).set({ documentId }).where(eq(schema.venues.id, venue.id)).run();
        }
      } else {
        const bench =
          (await db.select().from(schema.priceBenchmarks).where(eq(schema.priceBenchmarks.driveFileId, entry.id)).get()) ??
          (await db.select().from(schema.priceBenchmarks).where(eq(schema.priceBenchmarks.sourceKey, key)).get());
        if (bench) {
          matched = true;
          supplierId = bench.supplierId;
          await db.update(schema.priceBenchmarks).set({ documentId }).where(eq(schema.priceBenchmarks.id, bench.id)).run();
        }
      }
      if (!matched) report.unindexed.push(`${entry.name} (${folder})`);
      if (supplierId) {
        const c = await contactsFromDocument(documentId, supplierId, links);
        report.contacts.phones += c.phones;
        report.contacts.emails += c.emails;
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      report.failed.push({ name: entry.name, error: err instanceof Error ? err.message : String(err) });
    }
    done++;
    opts.onProgress?.(done, listing.length, entry.name);
  };

  // 4 download in parallelo
  const queue = [...listing];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (opts.shouldStop?.()) {
          queue.unshift(item);
          return;
        }
        await processOne(item);
      }
    }),
  );
  if (queue.length) report.pending = queue.length;
  return report;
}

/** Rifà l'estrazione dei contatti dai PDF già archiviati (dopo un miglioramento delle regole). */
export async function reextractPdfContacts() {
  const db = getDb();
  await db.delete(schema.supplierContacts).where(eq(schema.supplierContacts.verificationMethod, "pdf_text")).run();
  const linked = [
    ...(await db.select({ documentId: schema.venues.documentId, supplierId: schema.venues.supplierId }).from(schema.venues).all()),
    ...(await db
      .select({ documentId: schema.priceBenchmarks.documentId, supplierId: schema.priceBenchmarks.supplierId })
      .from(schema.priceBenchmarks)
      .all()),
  ];
  const totals = { phones: 0, emails: 0, documents: 0 };
  for (const { documentId, supplierId } of linked) {
    if (!documentId || !supplierId) continue;
    const r = await contactsFromDocument(documentId, supplierId);
    totals.phones += r.phones;
    totals.emails += r.emails;
    totals.documents++;
  }
  return totals;
}
