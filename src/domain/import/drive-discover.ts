import type { DriveSource } from "@/lib/settings-defaults";

// Dal solo link della cartella condivisa ("MVP SUPPLIERS") si ricavano sottocartelle,
// foglio "Executive Summary" e schede del foglio: niente ID da copiare a mano.

type Entry = { id: string; href: string; title: string };
type FolderKey = keyof DriveSource["folders"];

const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/;

/** ID della cartella da un link di Google Drive (o l'ID stesso). */
export function driveFolderId(link: string) {
  const raw = link.trim();
  if (DRIVE_ID.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const fromPath = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{20,})/)?.[1];
    const fromQuery = url.searchParams.get("id");
    const id = fromPath ?? fromQuery;
    return id && DRIVE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/** Voci della pagina pubblica di una cartella: ID, link (cartella, file, foglio) e titolo. */
export function parseFolderEntries(html: string): Entry[] {
  const out: Entry[] = [];
  const re = /class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?class="flip-entry-title">([^<]*)</g;
  for (const m of html.matchAll(re)) out.push({ id: m[1], href: decode(m[2]), title: decode(m[3]) });
  return out;
}

/** Schede di un foglio pubblicato (pagina htmlview): nome e gid. */
export function parseSheetTabs(html: string) {
  const tabs: { name: string; gid: string }[] = [];
  for (const m of html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)",[^}]*?gid: "(\d+)"/g)) {
    tabs.push({ name: m[1].replace(/\\(.)/g, "$1"), gid: m[2] });
  }
  return tabs;
}

const FOLDER_NAMES: Record<FolderKey, RegExp> = {
  works: /^works\b/i,
  location: /location|hotel/i,
  budgets: /budget/i,
  attrezzatura: /attrezzatur/i,
};

const TAB_NAMES: Record<FolderKey, RegExp> = {
  works: /^works\b/i,
  location: /^location/i,
  budgets: /^budget/i,
  attrezzatura: /^attrezzatur/i,
};

export type Discovery = { source: Omit<DriveSource, "localPath">; missing: string[] };

export async function discoverDriveSource(link: string, signal?: AbortSignal): Promise<Discovery> {
  const folderId = driveFolderId(link);
  if (!folderId) throw new Error("Link non riconosciuto: copia da Google Drive il link della cartella (…/drive/folders/…).");

  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, { signal });
  if (!res.ok) throw new Error(`Cartella non leggibile (HTTP ${res.status}): deve essere condivisa con "chiunque abbia il link".`);
  const entries = parseFolderEntries(await res.text());
  if (!entries.length) throw new Error("La cartella risulta vuota o non condivisa con link.");

  const missing: string[] = [];
  const folders = { works: "", location: "", budgets: "", attrezzatura: "" };
  for (const key of Object.keys(folders) as FolderKey[]) {
    const hit = entries.find((e) => e.href.includes("/folders/") && FOLDER_NAMES[key].test(e.title));
    if (hit) folders[key] = hit.id;
    else missing.push(`cartella ${key.toUpperCase()}`);
  }

  const sheets = entries.filter((e) => e.href.includes("/spreadsheets/"));
  const sheet = sheets.find((e) => /executive\s*summary/i.test(e.title)) ?? sheets[0];
  const gids = { works: "", location: "", budgets: "", attrezzatura: "" };
  if (!sheet) {
    missing.push("foglio Executive Summary");
  } else {
    const view = await fetch(`https://docs.google.com/spreadsheets/d/${sheet.id}/htmlview`, { signal, redirect: "follow" });
    const tabs = view.ok ? parseSheetTabs(await view.text()) : [];
    for (const key of Object.keys(gids) as FolderKey[]) {
      const tab = tabs.find((t) => TAB_NAMES[key].test(t.name));
      if (tab) gids[key] = tab.gid;
      else if (key !== "attrezzatura") missing.push(`scheda ${key.toUpperCase()} del foglio`);
    }
  }

  return {
    source: {
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
      sheetId: sheet?.id ?? "",
      gids,
      folders,
    },
    missing,
  };
}
