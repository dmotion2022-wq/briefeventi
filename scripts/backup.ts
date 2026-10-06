// Copia di sicurezza del database (coerente anche con l'app accesa): data/backups/app-AAAA-MM-GG-hhmm.db
// Uso: npm run backup
import "@/lib/load-env";
import fs from "node:fs";
import { getSqlite } from "@/db/client";
import { dataPath } from "@/lib/paths";

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const file = dataPath("backups", `app-${stamp}.db`);
await getSqlite().backup(file);
const keep = fs.readdirSync(dataPath("backups")).filter((f) => f.endsWith(".db")).sort();
for (const old of keep.slice(0, Math.max(0, keep.length - 20))) fs.unlinkSync(dataPath("backups", old));
console.log(`Backup salvato: ${file} (${Math.round(fs.statSync(file).size / 1024)} KB). Ne tengo gli ultimi 20.`);
