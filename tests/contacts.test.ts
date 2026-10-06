import { describe, expect, it } from "vitest";
import { extractEmails, extractPhones, normalizePhone, sourceContainsPhone } from "@/domain/contacts/phone";

// Numeri di esempio costruiti per i test (formati italiani validi, non contatti reali).
const brochure = `
  Villa Esempio – Eventi & Congressi
  Via Roma 1, 10121 Torino · Tel. +39 011 123 4567 · Fax 011.765.4321
  Ufficio eventi: eventi@villaesempio.example – mobile 347 123 4567
  Capienza plenaria 350 pax in platea. Prezzo € 8.450,00 + IVA
`;

describe("estrazione contatti", () => {
  it("riconosce fissi e cellulari italiani in formati diversi", () => {
    const phones = extractPhones(brochure);
    const numbers = phones.map((p) => p.e164);
    expect(numbers).toContain("+390111234567");
    expect(numbers).not.toContain("+390117654321"); // fax: non è un telefono da chiamare
    expect(numbers).toContain("+393471234567");
    expect(phones.find((p) => p.e164 === "+393471234567")?.type).toBe("mobile");
  });

  it("scarta partite IVA, fax, tabelle di capienze e numeri senza etichetta", () => {
    const numbers = (t: string) => extractPhones(t).map((p) => p.e164);
    expect(numbers("Sede legale Via Bivio 2, 58014 (GR) P.I.V.A e C.F. 01549670535 www.esempio.it")).toEqual([]);
    expect(numbers("Fax 011.765.4321")).toEqual([]);
    expect(numbers("PLATEA 115 BANCHI DI SCUOLA 50 48 48 22 20 24 12 12 80 60 CABARET 32 24")).toEqual([]);
    expect(numbers("mq 0.44 0.70 19.37 2.04 1.44 1.45 0.70 1.44 2.70")).toEqual([]);
    expect(numbers("Referente Maria Rossi 348 123 4567")).toEqual(["+393481234567"]);
    expect(numbers("T: +84 28 39 330 333")).toEqual(["+842839330333"]);
  });

  it("non scambia importi e CAP per telefoni", () => {
    const numbers = extractPhones("Totale € 8.450,00 · CAP 10121 · 350 pax").map((p) => p.e164);
    expect(numbers).toEqual([]);
  });

  it("estrae le email", () => {
    expect(extractEmails(brochure).map((e) => e.value)).toEqual(["eventi@villaesempio.example"]);
  });

  it("normalizza in E.164", () => {
    expect(normalizePhone("011 123 4567")).toBe("+390111234567");
    expect(normalizePhone("+39 347 1234567")).toBe("+393471234567");
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("verifica sulla fonte", () => {
  it("conferma un numero presente anche se scritto in un altro formato", () => {
    expect(sourceContainsPhone(brochure, "+390111234567").found).toBe(true);
    expect(sourceContainsPhone("Tel. 011/765.4321", "0117654321").found).toBe(true);
  });

  it("respinge un numero che nella fonte non c'è", () => {
    expect(sourceContainsPhone(brochure, "+39 02 1234 5678").found).toBe(false);
  });

  it("trova il numero anche spezzato da punti e spazi", () => {
    expect(sourceContainsPhone("Prenotazioni: 02.12.34.56.78", "+390212345678").found).toBe(true);
  });
});
