import { chromium } from "playwright-core";

// PDF con Playwright usando il Chrome installato sul Mac (nessun browser da scaricare).
export async function htmlToPdf(html: string, opts: { landscape?: boolean; footer?: string; fullBleed?: boolean } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    if (opts.fullBleed) {
      // impaginazione da presentazione: pagina piena, nessun margine né piè di pagina
      return await page.pdf({ format: "A4", landscape: opts.landscape ?? true, printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" }, preferCSSPageSize: true });
    }
    return await page.pdf({
      format: "A4",
      landscape: opts.landscape ?? false,
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font:8px Arial,sans-serif;color:#6B6478;padding:0 14mm;display:flex;justify-content:space-between"><span>${opts.footer ?? ""}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
}
