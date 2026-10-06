// Import dell'archivio dalla cartella Drive "MVP SUPPLIERS".
//   npm run import:drive            → prova a vuoto: mostra cosa cambierebbe
//   npm run import:drive -- --apply → applica l'indice
//   npm run import:drive -- --apply --files → applica e scarica/legge i PDF
//   npm run import:drive -- --contacts → ricalcola i contatti dai PDF già archiviati
import "@/lib/load-env";
import { prepareDb } from "@/db/prepare";
import { runDriveImport } from "@/domain/import/run-import";
import { reextractPdfContacts } from "@/domain/import/drive-files";

await prepareDb();

if (process.argv.includes("--contacts")) {
  const r = await reextractPdfContacts();
  console.log(`Contatti ricalcolati da ${r.documents} PDF: ${r.phones} telefoni, ${r.emails} email`);
  process.exit(0);
}

const apply = process.argv.includes("--apply");
const files = process.argv.includes("--files");

const fmt = (label: string, d: { added: string[]; changed: string[]; unchanged: number }) =>
  `${label}: ${d.added.length} nuovi, ${d.changed.length} aggiornati, ${d.unchanged} invariati`;

let last = "";
const { diff, files: report } = await runDriveImport({
  apply,
  files,
  onProgress: (pct, message) => {
    const line = `[${Math.round(pct).toString().padStart(3)}%] ${message}`;
    if (line !== last) console.log(line);
    last = line;
  },
});

console.log(apply ? "\nImport applicato" : "\nProva a vuoto (nessuna modifica). Rilancia con --apply per applicare.");
if (diff) {
  console.log(fmt("Proposte passate", diff.works));
  console.log(fmt("Location e hotel", diff.venues));
  console.log(fmt("Listino", diff.benchmarks));
}
if (report) {
  console.log(`\nPDF: ${report.listed} trovati, ${report.downloaded} scaricati, ${report.reused} già presenti`);
  console.log(`Contatti estratti dai PDF: ${report.contacts.phones} telefoni, ${report.contacts.emails} email`);
  if (report.ocrNeeded.length) console.log(`Da leggere con OCR (pagine senza testo): ${report.ocrNeeded.join("; ")}`);
  if (report.unindexed.length) console.log(`Non presenti nell'indice: ${report.unindexed.join("; ")}`);
  if (report.failed.length) console.log(`Errori: ${report.failed.map((f) => `${f.name}: ${f.error}`).join("; ")}`);
}
