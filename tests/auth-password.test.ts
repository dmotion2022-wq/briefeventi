import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from "@/auth/password";

describe("password", () => {
  it("hash e verifica: giusta sì, sbagliata no, sale diverso a ogni hash", async () => {
    const h1 = await hashPassword("una frase lunga e facile");
    const h2 = await hashPassword("una frase lunga e facile");
    expect(h1).not.toBe(h2);
    expect(h1.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("una frase lunga e facile", h1)).toBe(true);
    expect(await verifyPassword("una frase lunga e facilE", h1)).toBe(false);
    expect(await verifyPassword("", h1)).toBe(false);
  });

  it("un hash rovinato nel database non blocca e non fa entrare", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
    expect(await verifyPassword("x", "scrypt$999999999$8$1$c2FsZQ$aGFzaA")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc$8$1$c2FsZQ$aGFzaA")).toBe(false);
  });

  it("password temporanee leggibili e sempre diverse", () => {
    const all = new Set(Array.from({ length: 200 }, temporaryPassword));
    expect(all.size).toBe(200);
    for (const p of all) expect(p).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{5}-[a-km-zA-HJ-NP-Z2-9]{5}-[a-km-zA-HJ-NP-Z2-9]{5}$/);
  });

  it("regole per le nuove password", () => {
    expect(passwordProblem("corta")).toMatch(/almeno 10/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/semplice/);
    expect(passwordProblem("mario.rossi-2026!", "mario.rossi@esempio.it")).toMatch(/nome dell'email/);
    expect(passwordProblem("cavallo batteria graffetta")).toBeNull();
  });
});

describe("ritorno dopo il login", async () => {
  const { safeNextPath } = await import("@/auth/next-path");
  it("solo percorsi interni", () => {
    expect(safeNextPath("/projects/abc/brief?x=1")).toBe("/projects/abc/brief?x=1");
    for (const bad of ["https://esempio.com", "//esempio.com", "/\\esempio.com", "/login?next=/x", "", null, "/%09/esempio.com", "javascript:alert(1)"]) {
      expect(safeNextPath(bad), String(bad)).toBe("/");
    }
  });
});
