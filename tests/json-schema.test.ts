import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toStrictJsonSchema } from "@/ai/json-schema";
import { BriefSchema, gapAnalysisSchema } from "@/ai/schemas/brief";
import { BibleSchema, DEFAULT_RUBRIC, conceptsResponseSchema, critiqueSchema } from "@/ai/schemas/creative";
import { MODULE_ORDER, agendaSchema, moduleSchemas } from "@/ai/schemas/development";

type Json = Record<string, unknown>;

/** Per ogni oggetto dello schema: i nomi dei campi, con il percorso. */
function fieldNames(node: unknown, path = "$", out: Record<string, string[]> = {}) {
  if (Array.isArray(node)) node.forEach((n, i) => fieldNames(n, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    const obj = node as Json;
    if (obj.properties && typeof obj.properties === "object") {
      out[path] = Object.keys(obj.properties as Json).sort();
      for (const [name, sub] of Object.entries(obj.properties as Json)) fieldNames(sub, `${path}.${name}`, out);
    }
    for (const [key, value] of Object.entries(obj)) if (key !== "properties") fieldNames(value, `${path}/${key}`, out);
  }
  return out;
}

describe("schema JSON per Qwen", () => {
  it("tiene i campi che si chiamano come parole chiave di JSON Schema e toglie solo le parole chiave", () => {
    const js = toStrictJsonSchema(
      z.object({
        format: z.enum(["a", "b"]),
        pattern: z.string(),
        default: z.number(),
        minimum: z.number().nullable(),
        email: z.email(),
        nome: z.string().min(2).max(10),
      }),
    ) as { properties: Record<string, Json>; required: string[] };
    expect(Object.keys(js.properties).sort()).toEqual(["default", "email", "format", "minimum", "nome", "pattern"]);
    expect(js.required.sort()).toEqual(["default", "email", "format", "minimum", "nome", "pattern"]);
    expect(js.properties.format).toEqual({ type: "string", enum: ["a", "b"] });
    expect(js.properties.minimum.type).toEqual(["number", "null"]);
    // le parole chiave vere spariscono: format "email", lunghezze
    expect(js.properties.email).toEqual({ type: "string" });
    expect(js.properties.nome).toEqual({ type: "string" });
  });

  const modules = moduleSchemas({ slots: ["s1"], categories: ["location"], venues: ["v1"], formats: ["f1"] });
  const real: Record<string, z.ZodType> = {
    brief: BriefSchema,
    lacune: gapAnalysisSchema(["location", "catering"]),
    concept: conceptsResponseSchema(["f1"], ["w1"]),
    critica: critiqueSchema(DEFAULT_RUBRIC.map((c) => c.criterion)),
    bible: BibleSchema,
    scaletta: agendaSchema(["s1"]),
    ...Object.fromEntries(MODULE_ORDER.map((k) => [`modulo ${k}`, modules[k]])),
  };

  it.each(Object.keys(real))("%s: nessun campo perso e tutti obbligatori", (name) => {
    const schema = real[name];
    const raw = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
    const strict = toStrictJsonSchema(schema);
    expect(fieldNames(strict)).toEqual(fieldNames(raw));
    for (const [path, names] of Object.entries(fieldNames(strict))) {
      const node = path.split(/(?=[.[/])/).slice(1).reduce<unknown>((n, step) => {
        if (step.startsWith(".")) return ((n as Json).properties as Json)[step.slice(1)];
        if (step.startsWith("[")) return (n as unknown[])[Number(step.slice(1, -1))];
        return (n as Json)[step.slice(1)];
      }, strict) as Json;
      expect((node.required as string[]).slice().sort(), path).toEqual(names);
    }
  });

  it("il brief contiene il campo formato con le sue opzioni", () => {
    const js = toStrictJsonSchema(BriefSchema) as { properties: Record<string, Json>; required: string[] };
    expect(js.properties.format).toEqual({ type: "string", enum: ["in_presenza", "ibrido", "virtuale", "non_indicato"] });
    expect(js.required).toContain("format");
  });
});
