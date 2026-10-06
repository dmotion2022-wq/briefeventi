import { definePDFJSModule, renderPageAsImage } from "unpdf";

// Rendering di una pagina PDF in PNG (per l'OCR delle brochure fatte solo di immagini).
// Serve la build ufficiale di PDF.js e @napi-rs/canvas.
let ready: Promise<void> | null = null;
// build "legacy": quella moderna usa API di JavaScript non ancora presenti in Node 24
const ensurePdfjs = () => (ready ??= definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs")));

export async function renderPdfPage(buffer: Buffer, pageNumber: number, scale = 2): Promise<Buffer> {
  await ensurePdfjs();
  const out = await renderPageAsImage(new Uint8Array(buffer), pageNumber, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale,
  });
  return Buffer.from(out as ArrayBuffer);
}
