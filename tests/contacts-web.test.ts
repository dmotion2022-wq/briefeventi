import { describe, expect, it } from "vitest";
import { htmlToText, phonesInPage } from "@/domain/contacts/web";

// Pagina di esempio costruita per il test (numeri in formato valido, non contatti reali).
const HTML = `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"LocalBusiness","name":"Catering Esempio","telephone":"+39 011 765 4321"}</script>
<style>.x{color:red}</style><script>var tel = "02 9999 9999";</script>
</head><body>
<header><a href="tel:+393471234567">Chiamaci</a></header>
<main><h1>Catering Esempio &amp; Eventi</h1>
<p>Ufficio eventi: Tel. 011&nbsp;123 4567<br>P.IVA 01549670535</p>
<p>Scrivici a <a href="mailto:eventi@cateringesempio.example">eventi@cateringesempio.example</a></p>
</main></body></html>`;

describe("contatti da una pagina web", () => {
  it("toglie script e stili e decodifica le entità", () => {
    const text = htmlToText(HTML);
    expect(text).toContain("Catering Esempio & Eventi");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("9999");
  });

  it("raccoglie telefoni da link tel:, JSON-LD e testo con etichetta", () => {
    const { phones, emails } = phonesInPage(HTML);
    const byNumber = Object.fromEntries(phones.map((p) => [p.e164, p.how]));
    expect(byNumber).toEqual({
      "+393471234567": "link tel",
      "+390117654321": "dati strutturati",
      "+390111234567": "testo",
    });
    expect(emails).toEqual(["eventi@cateringesempio.example"]);
  });

  it("non prende la partita IVA né i numeri dentro gli script", () => {
    const numbers = phonesInPage(HTML).phones.map((p) => p.e164);
    expect(numbers).not.toContain("+390154967053");
    expect(numbers).not.toContain("+390299999999");
  });
});
