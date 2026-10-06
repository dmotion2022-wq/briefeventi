import { describe, expect, it } from "vitest";
import { describeAiError, isAuthError } from "@/ai/errors";

const withStatus = (status: number, message = "boom") => Object.assign(new Error(message), { status });

describe("errori delle chiamate a DashScope", () => {
  it("riconosce la chiave rifiutata sia dall'SDK sia dall'API nativa", () => {
    expect(isAuthError(withStatus(401))).toBe(true);
    expect(isAuthError(withStatus(403))).toBe(true);
    expect(isAuthError(new Error("DashScope 401: InvalidApiKey Invalid API-key provided."))).toBe(true);
    expect(isAuthError(withStatus(500))).toBe(false);
    expect(isAuthError(new Error("DashScope 400: InvalidParameter"))).toBe(false);
    expect(isAuthError("stringa")).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });

  it("spiega in italiano i casi comuni", () => {
    expect(describeAiError(withStatus(401))).toMatch(/rifiuta la chiave.*Singapore/);
    expect(describeAiError(new Error("DashScope 401: InvalidApiKey"))).toMatch(/rifiuta la chiave/);
    expect(describeAiError(withStatus(429))).toMatch(/credito esaurito/);
    expect(describeAiError(withStatus(404, "404 model not found"))).toMatch(/404.*model not found/);
    expect(describeAiError(new Error("Connection error."))).toMatch(/connessione a internet/);
    expect(describeAiError(new TypeError("fetch failed"))).toMatch(/connessione a internet/);
  });

  it("tronca i messaggi lunghi e accetta valori che non sono errori", () => {
    expect(describeAiError(new Error("x".repeat(500)))).toHaveLength(301);
    expect(describeAiError("testo")).toBe("testo");
  });
});
