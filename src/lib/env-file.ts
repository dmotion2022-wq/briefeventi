import fs from "node:fs";
import path from "node:path";

// .env.local è un file nascosto (il nome inizia con un punto, Finder non lo mostra): per non
// costringere a cercarlo, la chiave si incolla da Impostazioni e si scrive da qui. Interfaccia
// web e worker sono processi diversi, quindi i valori si rileggono dal file a ogni uso invece
// di fidarsi di process.env, che vale solo per il processo che l'ha caricato all'avvio.

export const envFilePath = () => path.join(process.cwd(), ".env.local");

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function parseValue(raw: string) {
  const v = raw.trim();
  const quoted = v.match(/^(["'])(.*?)\1\s*(?:#.*)?$/);
  if (quoted) return quoted[2];
  return v.replace(/\s+#.*$/, "").trim();
}

/** Valore di una variabile nel file; "" se il file o la variabile mancano o sono vuoti. L'ultima occorrenza vince, come in dotenv. */
export function readEnvFileValue(name: string, file = envFilePath()): string {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
  let value = "";
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (m && m[1] === name) value = parseValue(m[2]);
  }
  return value;
}

/** Imposta una variabile tenendo commenti e altre righe; crea il file se manca (permessi 600). La scrittura è atomica. */
export function writeEnvFileValue(name: string, value: string, file = envFilePath()) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Nome di variabile non valido");
  // niente a capo, spazi, apici o simboli di shell: servirebbero le virgolette e il file si romperebbe
  if (!/^[^\s#"'\\$`]*$/.test(value)) throw new Error("Valore non valido per .env.local");

  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    // il file non esiste ancora
  }
  const out: string[] = [];
  let written = false;
  for (const line of text ? text.split(/\r?\n/) : []) {
    const m = LINE.exec(line);
    if (m && m[1] === name) {
      // la prima occorrenza si sostituisce, le righe doppie si eliminano
      if (!written) out.push(`${name}=${value}`);
      written = true;
      continue;
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  if (!written) out.push(`${name}=${value}`);

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${out.join("\n")}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Il file vince su process.env: dopo un salvataggio da Impostazioni il valore vale subito, anche nel worker già avviato. */
export const envValue = (name: string) => readEnvFileValue(name) || process.env[name]?.trim() || "";

/** "sk-••••ab12": abbastanza per riconoscere la chiave, mai per ricostruirla. */
export const maskSecret = (secret: string) => (secret.length <= 8 ? "••••" : `${secret.slice(0, 3)}••••${secret.slice(-4)}`);
