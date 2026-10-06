"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkApiKey } from "@/ai/check-key";
import { getDb, schema } from "@/db/client";
import { writeEnvFileValue } from "@/lib/env-file";
import { getSetting, setSetting } from "@/lib/settings";
import { MODEL_TIERS, type ModelPrice } from "@/lib/settings-defaults";
import { percentToBp } from "@/lib/money";

const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

export type KeyState = { status: "idle" | "ok" | "error"; message: string };

const KEY_SHAPE = /^[A-Za-z0-9._-]{16,}$/;

/** "Salva e verifica" scrive la chiave in .env.local e la prova; "Verifica" prova quella già salvata. */
export async function apiKeyAction(_prev: KeyState, form: FormData): Promise<KeyState> {
  const verifyOnly = s(form, "intent") === "verify";
  if (!verifyOnly) {
    // se si incolla l'intera riga del file o la chiave tra virgolette, si tengono solo i caratteri della chiave
    const key = s(form, "apiKey")
      .replace(/^DASHSCOPE_API_KEY\s*=\s*/, "")
      .replace(/^["']|["']$/g, "");
    if (!key) return { status: "error", message: "Incolla la chiave nel campo, poi premi il pulsante." };
    if (!KEY_SHAPE.test(key)) {
      return { status: "error", message: "Questa non sembra una chiave: niente spazi o virgolette, di solito inizia con sk- ed è lunga. Riprova a copiarla per intero." };
    }
    writeEnvFileValue("DASHSCOPE_API_KEY", key);
  }
  revalidatePath("/settings");
  const models = getSetting("ai.models");
  const check = await checkApiKey(models.flash, Object.values(models));
  if (check.ok) return { status: "ok", message: `${verifyOnly ? "" : "Salvata. "}${check.message}` };
  return { status: "error", message: `${verifyOnly ? "" : "Salvata, ma non funziona. "}${check.message}` };
}

export async function saveAgencyAction(form: FormData) {
  setSetting("agency", {
    name: s(form, "name"),
    brand: s(form, "brand"),
    contactName: s(form, "contactName"),
    email: s(form, "email"),
    phone: s(form, "phone"),
    website: s(form, "website"),
    address: s(form, "address"),
    vatNumber: s(form, "vatNumber"),
  });
  revalidatePath("/settings");
}

export async function saveModelsAction(form: FormData) {
  const models = Object.fromEntries(MODEL_TIERS.map((t) => [t, s(form, `model_${t}`)])) as Record<(typeof MODEL_TIERS)[number], string>;
  for (const [tier, id] of Object.entries(models)) if (!id) throw new Error(`Modello mancante per ${tier}`);
  setSetting("ai.models", models);
  setSetting("ai.thinking", { max: form.get("thinking_max") === "on" });
  const fx = Number(s(form, "usdToEur").replace(",", "."));
  if (fx > 0) setSetting("ai.usdToEur", fx);
  // prezzi per modello: "input / output / input in cache" in USD per milione di token
  const prices: Record<string, ModelPrice> = { ...getSetting("ai.prices") };
  for (const id of new Set(Object.values(models))) {
    const num = (k: string) => {
      const v = s(form, `price_${id}_${k}`).replace(",", ".");
      return v ? Number(v) : undefined;
    };
    prices[id] = {
      inputPerMTok: num("in"),
      outputPerMTok: num("out"),
      cachedInputPerMTok: num("cached"),
      perThousandCalls: num("calls"),
      perImage: num("image"),
    };
  }
  setSetting("ai.prices", prices);
  revalidatePath("/settings");
}

export async function saveQuoteDefaultsAction(form: FormData) {
  const current = getSetting("quote.defaults");
  setSetting("quote.defaults", {
    ...current,
    validityDays: Number(s(form, "validityDays")) || current.validityDays,
    agencyFeeBp: percentToBp(Number(s(form, "agencyFee").replace(",", ".")) || 0),
    contingencyBp: percentToBp(Number(s(form, "contingency").replace(",", ".")) || 0),
    notes: s(form, "notes").split("\n").map((n) => n.trim()).filter(Boolean),
  });
  revalidatePath("/settings");
}

export async function saveListsAction(form: FormData) {
  setSetting("creative.cliches", s(form, "cliches").split("\n").map((n) => n.trim()).filter(Boolean));
  const sectors = { ...getSetting("compliance.sectors") };
  for (const key of Object.keys(sectors)) {
    sectors[key] = s(form, `sector_${key}`).split("\n").map((n) => n.trim()).filter(Boolean);
  }
  setSetting("compliance.sectors", sectors);
  setSetting("drive.source", { ...getSetting("drive.source"), localPath: s(form, "driveLocalPath") });
  revalidatePath("/settings");
}

const Regime = z.object({ label: z.string().min(2), rate: z.coerce.number().min(0).max(100), note: z.string() });

export async function saveVatRegimeAction(code: string, form: FormData) {
  const r = Regime.parse({ label: form.get("label"), rate: String(form.get("rate") ?? "").replace(",", "."), note: form.get("note") ?? "" });
  getDb()
    .update(schema.vatRegimes)
    .set({ label: r.label, rateBp: percentToBp(r.rate), invoiceNote: r.note || null })
    .where(eq(schema.vatRegimes.code, code))
    .run();
  revalidatePath("/settings");
}
