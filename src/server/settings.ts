"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkApiKey } from "@/ai/check-key";
import { requireAdmin } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { discoverDriveSource } from "@/domain/import/drive-discover";
import { writeEnvFileValue } from "@/lib/env-file";
import { getSetting, setSetting } from "@/lib/settings";
import { MODEL_TIERS, type ModelPrice } from "@/lib/settings-defaults";
import { percentToBp } from "@/lib/money";

const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

export type KeyState = { status: "idle" | "ok" | "error"; message: string };
export type DriveState = KeyState;

const KEY_SHAPE = /^[A-Za-z0-9._-]{16,}$/;

/** Online la chiave sta nelle variabili d'ambiente di Vercel: dall'app si può solo verificare. */
const keyEditable = () => !process.env.VERCEL;

/** "Salva e verifica" scrive la chiave in .env.local e la prova; "Verifica" prova quella già salvata. */
export async function apiKeyAction(_prev: KeyState, form: FormData): Promise<KeyState> {
  await requireAdmin();
  const verifyOnly = s(form, "intent") === "verify";
  if (!verifyOnly) {
    if (!keyEditable()) {
      return { status: "error", message: "Online la chiave si imposta su Vercel (variabile DASHSCOPE_API_KEY), non da qui." };
    }
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
  const models = await getSetting("ai.models");
  const check = await checkApiKey(models.flash, Object.values(models));
  if (check.ok) return { status: "ok", message: `${verifyOnly ? "" : "Salvata. "}${check.message}` };
  return { status: "error", message: `${verifyOnly ? "" : "Salvata, ma non funziona. "}${check.message}` };
}

/** Dal link della cartella condivisa: foglio, schede e sottocartelle si trovano da soli. */
export async function driveSourceAction(_prev: DriveState, form: FormData): Promise<DriveState> {
  await requireAdmin();
  const link = s(form, "folderUrl");
  const current = await getSetting("drive.source");
  const localPath = form.has("driveLocalPath") ? s(form, "driveLocalPath") : current.localPath;
  if (!link) {
    await setSetting("drive.source", { ...current, localPath });
    revalidatePath("/settings");
    return { status: "error", message: "Incolla il link della cartella MVP SUPPLIERS (condivisa con chiunque abbia il link)." };
  }
  try {
    const found = await discoverDriveSource(link);
    await setSetting("drive.source", { ...found.source, localPath });
    revalidatePath("/settings");
    revalidatePath("/library/import");
    if (found.missing.length) return { status: "error", message: `Collegata, ma non trovo: ${found.missing.join(", ")}. Controlla i nomi nella cartella.` };
    return { status: "ok", message: "Collegata: foglio Executive Summary, schede e sottocartelle trovati. Ora puoi importare dall'Archivio." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveAgencyAction(form: FormData) {
  await requireAdmin();
  await setSetting("agency", {
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
  await requireAdmin();
  const models = Object.fromEntries(MODEL_TIERS.map((t) => [t, s(form, `model_${t}`)])) as Record<(typeof MODEL_TIERS)[number], string>;
  for (const [tier, id] of Object.entries(models)) if (!id) throw new Error(`Modello mancante per ${tier}`);
  await setSetting("ai.models", models);
  await setSetting("ai.thinking", { max: form.get("thinking_max") === "on" });
  const fx = Number(s(form, "usdToEur").replace(",", "."));
  if (fx > 0) await setSetting("ai.usdToEur", fx);
  // prezzi per modello: "input / output / input in cache" in USD per milione di token
  const prices: Record<string, ModelPrice> = { ...(await getSetting("ai.prices")) };
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
  await setSetting("ai.prices", prices);
  revalidatePath("/settings");
}

export async function saveQuoteDefaultsAction(form: FormData) {
  await requireAdmin();
  const current = await getSetting("quote.defaults");
  await setSetting("quote.defaults", {
    ...current,
    validityDays: Number(s(form, "validityDays")) || current.validityDays,
    agencyFeeBp: percentToBp(Number(s(form, "agencyFee").replace(",", ".")) || 0),
    contingencyBp: percentToBp(Number(s(form, "contingency").replace(",", ".")) || 0),
    notes: s(form, "notes").split("\n").map((n) => n.trim()).filter(Boolean),
  });
  revalidatePath("/settings");
}

export async function saveListsAction(form: FormData) {
  await requireAdmin();
  await setSetting("creative.cliches", s(form, "cliches").split("\n").map((n) => n.trim()).filter(Boolean));
  const sectors = { ...(await getSetting("compliance.sectors")) };
  for (const key of Object.keys(sectors)) {
    sectors[key] = s(form, `sector_${key}`).split("\n").map((n) => n.trim()).filter(Boolean);
  }
  await setSetting("compliance.sectors", sectors);
  revalidatePath("/settings");
}

const Regime = z.object({ label: z.string().min(2), rate: z.coerce.number().min(0).max(100), note: z.string() });

export async function saveVatRegimeAction(code: string, form: FormData) {
  await requireAdmin();
  const r = Regime.parse({ label: form.get("label"), rate: String(form.get("rate") ?? "").replace(",", "."), note: form.get("note") ?? "" });
  await getDb()
    .update(schema.vatRegimes)
    .set({ label: r.label, rateBp: percentToBp(r.rate), invoiceNote: r.note || null })
    .where(eq(schema.vatRegimes.code, code))
    .run();
  revalidatePath("/settings");
}
