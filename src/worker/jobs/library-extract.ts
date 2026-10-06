import { and, eq, isNotNull, like } from "drizzle-orm";
import { z } from "zod";
import { generateObject } from "@/ai/generate";
import { getDb, schema } from "@/db/client";
import { documentPages } from "@/domain/documents";
import { verifyQuote } from "@/domain/evidence";
import { newId } from "@/lib/ids";
import { eurosToCents } from "@/lib/money";
import type { JobHandler } from "../context";
import { throwIfCancelled } from "../context";

// Lettura AI dei PDF dell'archivio: sale e capienze dalle brochure delle location, singole voci di
// prezzo dai preventivi dei fornitori (in listino come "da rivedere" finché non le approvi).

const SETUPS = ["theatre", "classroom", "cabaret", "banquet", "cocktail", "u_shape", "boardroom", "other"] as const;

const VenueExtract = z.object({
  properName: z.string().nullable().describe("Nome della location come scritto nel documento"),
  city: z.string().nullable(),
  region: z.string().nullable(),
  maxCapacity: z.number().int().nullable().describe("Capienza massima complessiva"),
  hotelRooms: z.number().int().nullable().describe("Numero di camere, se è un hotel"),
  spaces: z.array(
    z.object({
      name: z.string(),
      setup: z.enum(SETUPS).describe("theatre=platea, classroom=banchi di scuola, cabaret, banquet=banchetto, cocktail, u_shape=ferro di cavallo, boardroom"),
      capacity: z.number().int(),
      areaSqm: z.number().nullable(),
      heightM: z.number().nullable(),
      page: z.number().int().nullable(),
    }),
  ),
  usp: z.string().nullable(),
  constraints: z.string().nullable(),
});

const QuoteExtract = z.object({
  supplierName: z.string().nullable(),
  date: z.string().nullable(),
  vatIncluded: z.enum(["yes", "no", "unknown"]),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      unitCostEuro: z.number().nullable(),
      totalEuro: z.number().nullable(),
      quote: z.string().describe("Riga del documento copiata parola per parola"),
      page: z.number().int().nullable(),
    }),
  ),
});

const CAPACITY_HINT = /(platea|theatre|teatro|banchi|classroom|cabaret|banchetto|banquet|cocktail|capienza|capacity|mq|m²|sqm|ferro di cavallo|camere|rooms)/i;

function documentText(documentId: string, maxChars: number, prefer?: RegExp) {
  const pages = documentPages(documentId).filter((p) => p.text);
  const ordered = prefer ? [...pages.filter((p) => prefer.test(p.text)), ...pages.filter((p) => !prefer.test(p.text))] : pages;
  let out = "";
  for (const p of ordered) {
    const block = `[PAGINA ${p.pageNumber}]\n${p.text}\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return { text: out, pages };
}

export const libraryExtract: JobHandler = async (ctx) => {
  const db = getDb();
  const venues = db.select().from(schema.venues).where(isNotNull(schema.venues.documentId)).all();
  const quotes = db
    .select()
    .from(schema.priceBenchmarks)
    .where(and(isNotNull(schema.priceBenchmarks.documentId), eq(schema.priceBenchmarks.sourceKind, "sheet")))
    .all();
  const total = venues.length + quotes.length;
  let done = 0;
  let rooms = 0;
  let lines = 0;

  for (const v of venues) {
    throwIfCancelled(ctx.signal);
    ctx.progress((done / total) * 100, `Sale e capienze: ${v.name}`);
    done++;
    const { text } = documentText(v.documentId!, 60_000, CAPACITY_HINT);
    if (text.length < 200) continue;
    const r = await generateObject(
      { task: "library.extract.venue", runId: ctx.runId, signal: ctx.signal },
      {
        tier: "flash",
        schema: VenueExtract,
        schemaName: "venue_extract",
        temperature: 0,
        system: "Estrai dalla brochure di una location le sale con la capienza per tipo di allestimento. Solo dati scritti nel documento: niente stime. Indica la pagina dal marcatore [PAGINA n].",
        prompt: text,
      },
    );
    db.transaction((tx) => {
      tx.delete(schema.venueRooms).where(eq(schema.venueRooms.venueId, v.id)).run();
      for (const sp of r.spaces.filter((x) => x.capacity > 0 && x.capacity < 20_000)) {
        tx.insert(schema.venueRooms)
          .values({ id: newId("vrm"), venueId: v.id, name: sp.name, setup: sp.setup, capacity: sp.capacity, areaSqm: sp.areaSqm, heightM: sp.heightM, documentId: v.documentId, page: sp.page })
          .run();
        rooms++;
      }
      const maxRoom = Math.max(0, ...r.spaces.map((x) => x.capacity));
      tx.update(schema.venues)
        .set({
          capacityMax: v.capacityMax ?? (r.maxCapacity || maxRoom || null),
          rooms: v.rooms ?? r.hotelRooms,
          usp: v.usp ?? r.usp,
          constraints: v.constraints ?? r.constraints,
        })
        .where(eq(schema.venues.id, v.id))
        .run();
      // nome e città dal documento: se il foglio dice altro, lo si annota sul fornitore da controllare
      if (v.supplierId && (r.properName || r.city)) {
        const sup = tx.select().from(schema.suppliers).where(eq(schema.suppliers.id, v.supplierId)).get();
        const hints = [
          r.properName && r.properName.toLowerCase() !== sup?.name.toLowerCase() ? `nome nel PDF: ${r.properName}` : null,
          r.city && v.city && r.city.toLowerCase() !== v.city.toLowerCase() ? `città nel PDF: ${r.city} (nel foglio: ${v.city})` : null,
        ].filter(Boolean);
        if (sup && hints.length && !(sup.notes ?? "").includes(hints[0]!)) {
          tx.update(schema.suppliers)
            .set({ notes: [sup.notes, `Da controllare — ${hints.join("; ")}`].filter(Boolean).join("\n"), city: sup.city ?? r.city, region: sup.region ?? r.region })
            .where(eq(schema.suppliers.id, sup.id))
            .run();
        }
      }
    });
  }

  for (const b of quotes) {
    throwIfCancelled(ctx.signal);
    ctx.progress((done / total) * 100, `Voci di prezzo: ${b.supplierName ?? b.category}`);
    done++;
    const { text, pages } = documentText(b.documentId!, 40_000);
    if (text.length < 100) continue;
    const r = await generateObject(
      { task: "library.extract.quote", runId: ctx.runId, signal: ctx.signal },
      {
        tier: "flash",
        schema: QuoteExtract,
        schemaName: "quote_extract",
        temperature: 0,
        system: "Estrai le singole voci di prezzo da un preventivo di un fornitore per eventi. Importi in euro come numeri; copia la riga originale nel campo quote. Niente voci inventate.",
        prompt: text,
      },
    );
    db.delete(schema.priceBenchmarks).where(like(schema.priceBenchmarks.sourceKey, `pdf:${b.documentId}:%`)).run();
    r.lines.forEach((l, i) => {
      if (l.totalEuro == null && l.unitCostEuro == null) return;
      // la riga deve esistere davvero nel PDF, altrimenti non entra nemmeno in revisione
      if (!verifyQuote(l.quote, pages, l.page).verified) return;
      db.insert(schema.priceBenchmarks)
        .values({
          id: newId("bmk"),
          category: b.category,
          supplierId: b.supplierId,
          supplierName: b.supplierName ?? r.supplierName,
          city: b.city,
          useCase: l.description,
          paxRef: b.paxRef,
          observedAt: r.date ?? b.observedAt,
          pricingModel: l.unitCostEuro != null ? "unit" : "forfait",
          unit: l.unit,
          includedQuantity: l.quantity,
          unitCostCents: l.unitCostEuro != null ? eurosToCents(l.unitCostEuro) : null,
          totalCents: l.totalEuro != null ? eurosToCents(l.totalEuro) : null,
          vatIncluded: r.vatIncluded,
          included: l.quote,
          sourceKind: "pdf",
          sourceKey: `pdf:${b.documentId}:${i}`,
          documentId: b.documentId,
          page: l.page,
          reviewStatus: "pending",
        })
        .run();
      lines++;
    });
  }
  return { venues: venues.length, rooms, quotes: quotes.length, lines };
};
