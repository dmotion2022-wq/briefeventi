// Prove sulle API di Alibaba Model Studio con la tua chiave.
// Uso: npm run spike -- <models|json|thinking|search|ocr|image|all>
// Costano pochi centesimi; i risultati vanno riportati in docs/decisions.md.
import "@/lib/load-env";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { dataPath, ensureDataDirs } from "@/lib/paths";
import { chatJson, chatText, generateImageUrl, hasApiKey, listModels, ocrImage, webSearch } from "@/ai/qwen";
import { extractPhones } from "@/domain/contacts/phone";

const models = getSetting("ai.models");
const results: { name: string; ok: boolean; info: string }[] = [];

async function check(name: string, fn: () => Promise<string>) {
  const started = Date.now();
  try {
    const info = await fn();
    results.push({ name, ok: true, info });
    console.log(`PASS ${name} (${Date.now() - started} ms) — ${info}`);
  } catch (err) {
    const info = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, info });
    console.log(`FAIL ${name} — ${info}`);
  }
}

const Venue = z.object({
  nome: z.string(),
  citta: z.string(),
  capienza_plenaria: z.number().int().nullable(),
  setup: z.array(z.enum(["platea", "banchi", "cabaret", "banchetto", "cocktail"])),
  note: z.string().nullable(),
});
const sample =
  "Villa Esempio a Torino ospita fino a 350 persone in platea, 220 a banchetto e 400 in cocktail. Parcheggio interno.";

const spikes: Record<string, () => Promise<void>> = {
  async models() {
    await check("elenco modelli", async () => {
      const ids = await listModels();
      const wanted = Object.entries(models).map(([tier, id]) => `${tier}=${id}${ids.includes(id) ? "" : " (NON IN ELENCO)"}`);
      const qwen = ids.filter((id) => /^qwen/i.test(id));
      return `${ids.length} modelli; configurati: ${wanted.join(", ")}\n  qwen*: ${qwen.join(", ")}`;
    });
  },
  async json() {
    for (const tier of ["max", "flash"] as const) {
      await check(`json_schema su ${models[tier]}`, async () => {
        const res = await chatJson({
          model: models[tier],
          schemaName: "venue",
          schema: Venue,
          messages: [
            { role: "system", content: "Estrai i dati richiesti dal testo. Non inventare: usa null se manca." },
            { role: "user", content: sample },
          ],
        });
        return `modo ${res.mode}, ${res.usage.inputTokens}+${res.usage.outputTokens} token → ${JSON.stringify(res.data)}`;
      });
    }
  },
  async thinking() {
    await check(`thinking su ${models.max}`, async () => {
      const res = await chatText({
        model: models.max,
        thinking: true,
        messages: [{ role: "user", content: "In una frase: perché una silent conference può funzionare in un museo?" }],
      });
      return `ragionamento ${res.reasoning.length} caratteri, risposta: ${res.text.slice(0, 160)}`;
    });
  },
  async search() {
    // "agent" richiede ragionamento e streaming: con la chiamata non in streaming DashScope risponde 400
    for (const options of [{}, { search_strategy: "max" }]) {
      await check(`ricerca con fonti su ${models.search} ${JSON.stringify(options)}`, async () => {
        const res = await webSearch({
          model: models.search,
          system: "Sei un assistente per un'agenzia di eventi. Rispondi in italiano citando le fonti.",
          query: "Trova 3 aziende di catering per eventi aziendali a Torino con il loro sito ufficiale e numero di telefono.",
          searchOptions: options,
        });
        const phones = extractPhones(res.text).map((p) => p.display);
        return `${res.sources.length} fonti, ${res.searches} ricerche, ${res.usage.inputTokens}+${res.usage.outputTokens} token; telefoni nel testo: ${phones.length}\n  fonti: ${res.sources
          .slice(0, 5)
          .map((s) => s.url)
          .join(" | ")}`;
      });
    }
  },
  async ocr() {
    await check(`ocr su ${models.ocr}`, async () => {
      ensureDataDirs();
      const html = path.join(dataPath("files"), "spike-ocr.html");
      const png = path.join(dataPath("files"), "spike-ocr.png");
      fs.writeFileSync(
        html,
        `<html><body style="font:28px Georgia;padding:40px"><h1>Villa Esempio</h1><p>Tel. +39 011 123 4567 · eventi@villaesempio.example</p><p>Sala Grande: 350 posti a platea</p></body></html>`,
      );
      execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
        "--headless=new",
        "--disable-gpu",
        `--screenshot=${png}`,
        "--window-size=1000,500",
        `file://${html}`,
      ], { stdio: "ignore" });
      const res = await ocrImage({ model: models.ocr, pngBase64: fs.readFileSync(png).toString("base64") });
      const phones = extractPhones(res.text).map((p) => p.e164);
      return `telefoni letti: ${phones.join(", ") || "nessuno"} · testo: ${res.text.replace(/\s+/g, " ").slice(0, 140)}`;
    });
  },
  async image() {
    await check(`immagine su ${models.image}`, async () => {
      ensureDataDirs();
      const res = await generateImageUrl({
        model: models.image,
        prompt:
          "Key visual per una convention aziendale: un palco minimal in un ex spazio industriale, luci viola e ambra, pubblico in silhouette, atmosfera elegante. Nessun testo.",
        size: "1664*928",
      });
      const file = dataPath("images", "spike.png");
      const buf = Buffer.from(await (await fetch(res.url)).arrayBuffer());
      fs.writeFileSync(file, buf);
      return `${Math.round(buf.length / 1024)} KB salvati in ${file}`;
    });
  },
};

async function main() {
  if (!hasApiKey()) {
    console.log("Manca DASHSCOPE_API_KEY in .env.local: inseriscila e rilancia.");
    process.exit(1);
  }
  const which = process.argv[2] ?? "all";
  const names = which === "all" ? Object.keys(spikes) : [which];
  for (const name of names) {
    if (!spikes[name]) throw new Error(`Spike sconosciuto: ${name}`);
    await spikes[name]();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} prove superate`);
}

void main();
