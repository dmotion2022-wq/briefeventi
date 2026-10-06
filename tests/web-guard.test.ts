import { describe, expect, it } from "vitest";
import { isPublicWebUrl } from "@/domain/contacts/web";

describe("il server apre solo siti pubblici", () => {
  it("accetta i siti normali", () => {
    expect(isPublicWebUrl("https://www.esempio.it/contatti")).toBe(true);
    expect(isPublicWebUrl("http://8.8.8.8/")).toBe(true);
  });
  it("rifiuta rete locale, localhost e protocolli diversi", () => {
    for (const bad of [
      "http://localhost:3100/api",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.20.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://intranet/",
      "http://stampante.local/",
      "file:///etc/passwd",
      "ftp://esempio.it/",
      "non un url",
    ]) {
      expect(isPublicWebUrl(bad), bad).toBe(false);
    }
  });
});
