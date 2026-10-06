import { describe, expect, it } from "vitest";
import { PLATFORM_SEED } from "@/db/platforms-seed";
import { PLATFORM_TYPES } from "@/db/schema";
import { normalizePhone } from "@/domain/contacts/phone";
import { PLATFORM_CATEGORY_LABELS, platformCategoryFor, platformSearchLink } from "@/lib/labels";

describe("piattaforme della ricerca", () => {
  it("chiavi uniche, categorie e tipi ammessi, siti in https", () => {
    expect(PLATFORM_SEED.length).toBeGreaterThan(100);
    expect(new Set(PLATFORM_SEED.map((p) => p.seedKey)).size).toBe(PLATFORM_SEED.length);
    for (const p of PLATFORM_SEED) {
      expect(p.categories.length, p.name).toBeGreaterThan(0);
      for (const c of p.categories) expect(PLATFORM_CATEGORY_LABELS, `${p.name}: ${c}`).toHaveProperty(c);
      expect(PLATFORM_TYPES).toContain(p.type);
      expect(p.url, p.name).toMatch(/^https:\/\//);
      expect(p.description.length, p.name).toBeGreaterThan(30);
    }
  });

  it("ogni contatto ha la pagina da cui viene, telefoni validi in formato internazionale", () => {
    for (const p of PLATFORM_SEED) {
      if (p.email) {
        expect(p.email, p.name).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
        expect(p.emailSource, p.name).toMatch(/^https?:\/\//);
      }
      if (p.phone) {
        expect(normalizePhone(p.phone), p.name).toBe(p.phone);
        expect(p.phoneSource, p.name).toMatch(/^https?:\/\//);
        expect(p.phoneDisplay, p.name).toBeTruthy();
      }
    }
  });

  it("ogni categoria ha almeno due piattaforme", () => {
    for (const c of Object.keys(PLATFORM_CATEGORY_LABELS)) {
      expect(PLATFORM_SEED.filter((p) => p.categories.includes(c)).length, c).toBeGreaterThanOrEqual(2);
    }
  });

  it("link di ricerca con segnaposto", () => {
    for (const p of PLATFORM_SEED.filter((x) => x.searchUrl)) expect(p.searchUrl, p.name).toMatch(/\{q\}|\{city\}/);
    expect(platformSearchLink("https://x.it/ricerca/{q}/{city}", "service audio luci", "Torino")).toBe("https://x.it/ricerca/service%20audio%20luci/Torino");
    expect(platformSearchLink("https://x.it/{city}--Italy", "x", "")).toBeNull();
    expect(platformSearchLink(null, "x")).toBeNull();
  });

  it("categoria delle piattaforme per una voce di costo", () => {
    expect(platformCategoryFor("catering")).toBe("catering");
    expect(platformCategoryFor("sale_allestimento")).toBe("location");
    expect(platformCategoryFor("segreteria")).toBe("generale");
    expect(platformCategoryFor(null)).toBe("generale");
  });
});
