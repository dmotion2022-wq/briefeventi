// Copia archivio e progetti del Mac nella versione online: righe del database locale → Turso,
// file di data/ (PDF, immagini, export, pagine di prova) → archivio Blob privato.
//
//   npx tsx scripts/copy-to-cloud.ts --env .env.cloud            → prova: dice cosa copierebbe
//   npx tsx scripts/copy-to-cloud.ts --env .env.cloud --apply    → copia
//
// .env.cloud contiene le variabili del progetto Vercel (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN,
// BLOB_READ_WRITE_TOKEN), per esempio scaricate con `vercel env pull .env.cloud`.
// Parte solo se online non ci sono ancora progetti né fornitori: niente doppioni.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { put } from "@vercel/blob";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const envFile = arg("--env");
if (envFile) process.loadEnvFile(envFile);
const apply = process.argv.includes("--apply");
// solo per prove: copia le righe ma non i file
const skipFiles = process.argv.includes("--no-files");

const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
if (!remoteUrl || !process.env.TURSO_AUTH_TOKEN || !blobToken) {
  console.error("Servono TURSO_DATABASE_URL, TURSO_AUTH_TOKEN e BLOB_READ_WRITE_TOKEN (es. --env .env.cloud).");
  process.exit(1);
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const source = drizzle(createClient({ url: pathToFileURL(path.join(dataDir, "app.db")).href }), { schema });
const target = drizzle(createClient({ url: remoteUrl.replace(/^libsql:\/\//i, "https://"), authToken: process.env.TURSO_AUTH_TOKEN }), { schema });

// Ordine delle tabelle: prima quelle a cui le altre fanno riferimento.
// "replace": tabelle con i dati di partenza (online sono già state riempite): vince la versione del Mac.
const TABLES: [string, SQLiteTable, "replace" | "insert"][] = [
  ["impostazioni", schema.settings, "replace"],
  ["contatori", schema.counters, "replace"],
  ["regimi IVA", schema.vatRegimes, "replace"],
  ["checklist", schema.checklistItems, "replace"],
  ["piattaforme", schema.platforms, "replace"],
  ["fornitori", schema.suppliers, "insert"],
  ["contatti", schema.supplierContacts, "insert"],
  ["progetti", schema.projects, "insert"],
  ["documenti", schema.documents, "insert"],
  ["pagine dei documenti", schema.documentPages, "insert"],
  ["proposte passate", schema.referenceWorks, "insert"],
  ["format", schema.formatIdeas, "replace"],
  ["location", schema.venues, "insert"],
  ["sale", schema.venueRooms, "insert"],
  ["listino", schema.priceBenchmarks, "insert"],
  ["brief", schema.briefs, "insert"],
  ["lacune", schema.gapItems, "insert"],
  ["concept", schema.concepts, "insert"],
  ["concept bible", schema.conceptBibles, "insert"],
  ["scaletta", schema.agendaSlots, "insert"],
  ["moduli", schema.modules, "insert"],
  ["componenti", schema.components, "insert"],
  ["preventivi", schema.quotes, "insert"],
  ["sezioni", schema.quoteSections, "insert"],
  ["voci", schema.quoteLines, "insert"],
  ["collegamenti fornitori", schema.supplierLinks, "insert"],
  ["contatti con i fornitori", schema.supplierInteractions, "insert"],
  ["richieste di preventivo", schema.rfqDrafts, "insert"],
  ["immagini", schema.imageAssets, "insert"],
  ["export", schema.exportsTable, "insert"],
  ["lavori AI", schema.aiRuns, "insert"],
  ["chiamate AI", schema.aiCalls, "insert"],
];

const n = async (db: typeof target, table: SQLiteTable) => (await db.select({ n: count() }).from(table).all())[0].n;

console.log(apply ? "Copia verso la versione online" : "Prova (nessuna scrittura): aggiungi --apply per copiare");
await migrate(target, { migrationsFolder: path.join(process.cwd(), "drizzle") });

const busy = (await n(target, schema.projects)) + (await n(target, schema.suppliers));
if (busy > 0 && !process.argv.includes("--force")) {
  console.error("Online ci sono già progetti o fornitori: per non creare doppioni la copia si ferma (--force per procedere comunque).");
  process.exit(1);
}

let rows = 0;
for (const [label, table, mode] of TABLES) {
  const data = (await source.select().from(table).all()) as Record<string, unknown>[];
  rows += data.length;
  console.log(`${label.padEnd(26)} ${String(data.length).padStart(6)} righe${mode === "replace" ? " (sostituiscono quelle di partenza)" : ""}`);
  if (!apply || !data.length) continue;
  if (mode === "replace") await target.delete(table).run();
  // a blocchi: le pagine dei documenti possono essere tante e lunghe
  for (let i = 0; i < data.length; i += 40) await target.insert(table).values(data.slice(i, i + 40)).onConflictDoNothing().run();
}

// File: ogni percorso salvato nel database, con la stessa chiave nell'archivio online.
const keys = new Set<string>();
for (const d of await source.select({ p: schema.documents.path }).from(schema.documents).all()) keys.add(d.p);
for (const d of await source.select({ p: schema.imageAssets.path }).from(schema.imageAssets).all()) keys.add(d.p);
for (const d of await source.select({ p: schema.exportsTable.path }).from(schema.exportsTable).all()) keys.add(d.p);
for (const c of await source.select({ e: schema.supplierContacts.evidence }).from(schema.supplierContacts).all()) if (c.e?.evidencePath) keys.add(c.e.evidencePath);

let uploaded = 0;
const missing: string[] = [];
for (const key of keys) {
  const file = path.join(dataDir, key);
  if (!fs.existsSync(file)) {
    missing.push(key);
    continue;
  }
  if (apply && !skipFiles) await put(key.replaceAll("\\", "/"), fs.readFileSync(file), { access: "private", addRandomSuffix: false, allowOverwrite: true, token: blobToken });
  uploaded++;
}
const fileState = apply && !skipFiles ? " copiati" : skipFiles ? " non copiati (--no-files)" : " da copiare";
console.log(`\n${rows} righe, ${uploaded} file${fileState}${missing.length ? `, ${missing.length} file mancanti sul Mac` : ""}.`);
if (missing.length) console.log(`Mancanti: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
