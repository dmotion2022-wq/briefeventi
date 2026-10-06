import type { JobHandler } from "./context";
import { libraryImport } from "./jobs/library";
import { briefExtract, gapAnalyze } from "./jobs/brief";
import { bibleBuild, conceptGenerate } from "./jobs/creative";
import { agendaDevelop, modulesDevelop } from "./jobs/development";
import { rfqDraft, supplierSearch } from "./jobs/suppliers";
import { imagesGenerate } from "./jobs/images";
import { documentsOcr } from "./jobs/ocr";
import { libraryExtract } from "./jobs/library-extract";
import { throwIfCancelled } from "./context";

// Ogni task del worker ha un handler. I moduli reali si registrano qui man mano.
export const jobs: Record<string, JobHandler> = {
  "library.import": libraryImport,
  "brief.extract": briefExtract,
  "gap.analyze": gapAnalyze,
  "concept.generate": conceptGenerate,
  "bible.build": bibleBuild,
  "agenda.develop": agendaDevelop,
  "modules.develop": modulesDevelop,
  "supplier.search": supplierSearch,
  "rfq.draft": rfqDraft,
  "images.generate": imagesGenerate,
  "documents.ocr": documentsOcr,
  "library.extract": libraryExtract,
  // Lavoro di prova: verifica coda, avanzamento e annullamento senza chiamare l'AI.
  "system.selftest": async (ctx) => {
    const steps = Number(ctx.input.steps ?? 5);
    for (let i = 1; i <= steps; i++) {
      throwIfCancelled(ctx.signal);
      await new Promise((r) => setTimeout(r, 300));
      ctx.progress((i / steps) * 100, `Passo ${i} di ${steps}`);
    }
    return { ok: true, steps };
  },
};
