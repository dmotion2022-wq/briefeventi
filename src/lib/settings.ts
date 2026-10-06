import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DEFAULT_SETTINGS, type SettingKey, type SettingsShape } from "./settings-defaults";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Valore salvato; per gli oggetti, i campi aggiunti in versioni successive prendono il default. */
export function getSetting<K extends SettingKey>(key: K): SettingsShape[K] {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  const fallback = DEFAULT_SETTINGS[key];
  if (row == null) return fallback;
  if (isPlainObject(fallback) && isPlainObject(row.value)) {
    return { ...(fallback as Record<string, unknown>), ...row.value } as SettingsShape[K];
  }
  return row.value as SettingsShape[K];
}

export function setSetting<K extends SettingKey>(key: K, value: SettingsShape[K]) {
  getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
