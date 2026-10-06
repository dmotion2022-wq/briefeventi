import { z } from "zod";

type Json = Record<string, unknown>;

const DROP_KEYS = new Set([
  "$schema",
  "$id",
  "format",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "default",
]);

// Mappe i cui nomi sono campi dello schema, non parole chiave: un campo "format" o "pattern" va tenuto.
const NAME_MAPS = new Set(["properties", "definitions", "$defs", "patternProperties"]);

const SIMPLE = new Set(["string", "number", "integer", "boolean"]);

/**
 * Converte uno schema zod nel JSON Schema "strict" accettato dal json_schema mode di Qwen:
 * ogni oggetto con additionalProperties:false e tutte le proprietà obbligatorie (i campi
 * facoltativi vanno modellati come .nullable()), niente vincoli numerici o di lunghezza
 * (li controlla zod lato nostro), nullable semplici come type: [T, "null"].
 */
export function toStrictJsonSchema(schema: z.ZodType): Json {
  const raw = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Json;
  return normalize(raw) as Json;
}

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== "object") return node;

  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    if (DROP_KEYS.has(key)) continue;
    out[key] =
      NAME_MAPS.has(key) && value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value as Json).map(([name, sub]) => [name, normalize(sub)]))
        : normalize(value);
  }

  // anyOf [T, null] con T semplice → type: [T, "null"]
  const anyOf = out.anyOf as Json[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const nullIdx = anyOf.findIndex((b) => b.type === "null");
    if (nullIdx !== -1) {
      const other = anyOf[1 - nullIdx];
      if (typeof other.type === "string" && (SIMPLE.has(other.type) || other.type === "object" || other.type === "array")) {
        delete out.anyOf;
        Object.assign(out, other, { type: [other.type, "null"] });
        if (Array.isArray(other.enum)) out.enum = [...(other.enum as unknown[]), null];
      }
    }
  }

  const type = out.type;
  const isObject = type === "object" || (Array.isArray(type) && type.includes("object"));
  if (isObject && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Json);
  }
  return out;
}
