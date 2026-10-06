import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maskSecret, readEnvFileValue, writeEnvFileValue } from "@/lib/env-file";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "es-env-"));
  file = path.join(dir, ".env.local");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const EXAMPLE = `# Copia questo file in .env.local
DASHSCOPE_API_KEY=
# Regione Singapore
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com
# DATA_DIR=
`;

describe("lettura di .env.local", () => {
  it("legge valori semplici, tra apici, con export e con commento in coda", () => {
    fs.writeFileSync(
      file,
      ["A=uno", "B='due'", 'C="tre" # nota', "export D=quattro", "E=cinque # nota", "  F = sei ", "# G=commentata"].join("\r\n"),
    );
    expect(readEnvFileValue("A", file)).toBe("uno");
    expect(readEnvFileValue("B", file)).toBe("due");
    expect(readEnvFileValue("C", file)).toBe("tre");
    expect(readEnvFileValue("D", file)).toBe("quattro");
    expect(readEnvFileValue("E", file)).toBe("cinque");
    expect(readEnvFileValue("F", file)).toBe("sei");
    expect(readEnvFileValue("G", file)).toBe("");
  });

  it("restituisce stringa vuota se il file o la variabile mancano o sono vuoti", () => {
    expect(readEnvFileValue("DASHSCOPE_API_KEY", file)).toBe("");
    fs.writeFileSync(file, EXAMPLE);
    expect(readEnvFileValue("DASHSCOPE_API_KEY", file)).toBe("");
    expect(readEnvFileValue("NON_ESISTE", file)).toBe("");
  });

  it("l'ultima occorrenza vince, come in dotenv", () => {
    fs.writeFileSync(file, "K=prima\nK=dopo\n");
    expect(readEnvFileValue("K", file)).toBe("dopo");
  });
});

describe("scrittura di .env.local", () => {
  it("sostituisce la riga della variabile e tiene commenti e altre righe", () => {
    fs.writeFileSync(file, EXAMPLE);
    writeEnvFileValue("DASHSCOPE_API_KEY", "sk-0123456789abcdef", file);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toBe(EXAMPLE.replace("DASHSCOPE_API_KEY=\n", "DASHSCOPE_API_KEY=sk-0123456789abcdef\n"));
    expect(readEnvFileValue("DASHSCOPE_BASE_URL", file)).toBe("https://dashscope-intl.aliyuncs.com");
  });

  it("aggiunge la variabile se manca e crea il file con permessi 600", () => {
    writeEnvFileValue("DASHSCOPE_API_KEY", "sk-0123456789abcdef", file);
    expect(fs.readFileSync(file, "utf8")).toBe("DASHSCOPE_API_KEY=sk-0123456789abcdef\n");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    fs.writeFileSync(file, "ALTRA=1\n\n\n");
    writeEnvFileValue("DASHSCOPE_API_KEY", "sk-0123456789abcdef", file);
    expect(fs.readFileSync(file, "utf8")).toBe("ALTRA=1\nDASHSCOPE_API_KEY=sk-0123456789abcdef\n");
  });

  it("elimina le righe doppie e non lascia file temporanei", () => {
    fs.writeFileSync(file, "K=1\nX=2\nK=3\n");
    writeEnvFileValue("K", "nuovo", file);
    expect(fs.readFileSync(file, "utf8")).toBe("K=nuovo\nX=2\n");
    expect(fs.readdirSync(dir)).toEqual([".env.local"]);
  });

  it("rifiuta valori che romperebbero il file", () => {
    for (const bad of ["con spazio", "a\nb", 'con"apici', "con#cancelletto", "con$dollaro", "con\\barra"]) {
      expect(() => writeEnvFileValue("K", bad, file)).toThrow();
    }
    expect(() => writeEnvFileValue("1NOME", "x", file)).toThrow();
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe("maskSecret", () => {
  it("mostra solo l'inizio e la fine", () => {
    expect(maskSecret("sk-0123456789abcdef")).toBe("sk-••••cdef");
    expect(maskSecret("corta")).toBe("••••");
  });
});
