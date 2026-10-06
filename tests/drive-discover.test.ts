import { describe, expect, it } from "vitest";
import { driveFolderId, parseFolderEntries, parseSheetTabs } from "@/domain/import/drive-discover";

const FOLDER = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("archivio Drive dal solo link", () => {
  it("riconosce l'ID della cartella", () => {
    expect(driveFolderId(`https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`)).toBe(FOLDER);
    expect(driveFolderId(`https://drive.google.com/drive/u/0/folders/${FOLDER}`)).toBe(FOLDER);
    expect(driveFolderId(`https://drive.google.com/open?id=${FOLDER}`)).toBe(FOLDER);
    expect(driveFolderId(FOLDER)).toBe(FOLDER);
    expect(driveFolderId("https://esempio.it/cartella")).toBeNull();
  });

  it("legge le voci della pagina pubblica della cartella", () => {
    const html = `<div class="flip-entries"><div class="flip-entry" id="entry-1WoRkSwOrKsWoRkSwOrKs00" tabindex="0"><div class="flip-entry-info"><a href="https://drive.google.com/drive/folders/1WoRkSwOrKsWoRkSwOrKs00" target="_blank"><div class="flip-entry-title">WORKS</div></a></div></div><div class="flip-entry" id="entry-1ShEeTsHeEtShEeTsHeEt00" tabindex="0"><div class="flip-entry-info"><a href="https://docs.google.com/spreadsheets/d/1ShEeTsHeEtShEeTsHeEt00/edit?usp=drive_web" target="_blank"><div class="flip-entry-title">Executive Summary &amp; prezzi</div></a></div></div></div>`;
    expect(parseFolderEntries(html)).toEqual([
      { id: "1WoRkSwOrKsWoRkSwOrKs00", href: "https://drive.google.com/drive/folders/1WoRkSwOrKsWoRkSwOrKs00", title: "WORKS" },
      { id: "1ShEeTsHeEtShEeTsHeEt00", href: "https://docs.google.com/spreadsheets/d/1ShEeTsHeEtShEeTsHeEt00/edit?usp=drive_web", title: "Executive Summary & prezzi" },
    ]);
  });

  it("legge nomi e gid delle schede del foglio", () => {
    const js = `items.push({name: "WORKS", pageUrl: "https:\\/\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=0", gid: "0",initialSheet: ("0" == gid)});items.push({name: "LOCATION", pageUrl: "u", gid: "819",initialSheet: false});`;
    expect(parseSheetTabs(js)).toEqual([
      { name: "WORKS", gid: "0" },
      { name: "LOCATION", gid: "819" },
    ]);
  });
});
