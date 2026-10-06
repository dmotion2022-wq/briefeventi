import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateObject, searchWeb } from "@/ai/generate";
import { maskFor } from "@/ai/context";
import { getDb, schema } from "@/db/client";
import { crawlContacts } from "@/domain/contacts/web";
import { formatPhoneDisplay, phoneType } from "@/domain/contacts/phone";
import { platformsForCategories } from "@/db/queries/platforms";
import { newId } from "@/lib/ids";
import { platformCategoryFor } from "@/lib/labels";
import { getSetting } from "@/lib/settings";
import type { JobHandler } from "../context";
import { throwIfCancelled } from "../context";

const Candidates = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
      website: z.string().nullable().describe("Dominio del sito ufficiale dell'azienda, non portali o directory"),
      city: z.string().nullable(),
      why: z.string().describe("Perché è adatto a questa richiesta"),
      sources: z.array(z.number().int()).describe("Numeri delle fonti [n] che lo citano"),
    }),
  ),
});

const PORTALS = /(paginegialle|tripadvisor|facebook|instagram|linkedin|google|booking\.com|venuereport|eventi-aziendali|matrimonio|wedding|yelp|virgilio|youtube|wikipedia)/i;

async function lineContext(quoteLineId: string) {
  const db = getDb();
  const line = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.id, quoteLineId)).get();
  if (!line) throw new Error("Voce di preventivo non trovata");
  const quote = await db.select().from(schema.quotes).where(eq(schema.quotes.id, line.quoteId)).get();
  if (!quote) throw new Error("Preventivo non trovato");
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, quote.projectId)).get();
  if (!project) throw new Error("Progetto non trovato");
  const component = line.componentId ? await db.select().from(schema.components).where(eq(schema.components.id, line.componentId)).get() : undefined;
  return { line, quote, project, component };
}

/** Ricerca di nuovi fornitori per una voce: Qwen con fonti, poi verifica dei telefoni sul sito ufficiale. */
export const supplierSearch: JobHandler = async (ctx) => {
  const db = getDb();
  const { line, project, component } = await lineContext(String(ctx.input.quoteLineId));
  const where = [project.city, project.region].filter(Boolean).join(", ") || "Italia";
  const kind = ((component?.specs as { supplierKind?: string } | null)?.supplierKind ?? "other") as (typeof schema.SUPPLIER_KINDS)[number];
  const call = { runId: ctx.runId, projectId: project.id, signal: ctx.signal, mask: maskFor(project) };
  // le piattaforme che il team usa per questa categoria indirizzano la ricerca (ma il sito resta quello del fornitore)
  const platforms = (await platformsForCategories([platformCategoryFor(component?.category)])).filter((p) => p.status === "in_uso").slice(0, 6);
  const platformDomains = new Set(platforms.map((p) => p.domain).filter(Boolean));
  const platformHint = platforms.length
    ? ` Cerca anche negli elenchi e nei portali che usiamo (${platforms.map((p) => p.domain ?? p.name).join(", ")}), ma per ogni fornitore indica il suo sito ufficiale, non la pagina del portale.`
    : "";

  ctx.progress(10, "Ricerca sul web");
  const search = await searchWeb(
    { ...call, task: "supplier.search" },
    {
      system:
        "Sei il responsabile acquisti di un'agenzia di eventi italiana. Cerchi fornitori reali e attivi, con il loro sito ufficiale. Rispondi in italiano citando le fonti con [n].",
      query: `Trova 5 fornitori per: ${line.description}${line.detail ? ` (${line.detail})` : ""}. Evento aziendale a ${where}${project.paxTarget ? ` per circa ${project.paxTarget} persone` : ""}. Per ciascuno indica nome, sito ufficiale, città e perché è adatto.${platformHint}`,
    },
  );
  throwIfCancelled(ctx.signal);

  ctx.progress(40, `Lettura dei risultati (${search.sources.length} fonti)`);
  const sourcesText = search.sources.map((s) => `[${s.index}] ${s.title} — ${s.url}`).join("\n");
  const structured = await generateObject(
    { ...call, task: "supplier.search.structure" },
    {
      tier: "flash",
      schema: Candidates,
      schemaName: "supplier_candidates",
      temperature: 0,
      system:
        "Estrai i fornitori citati nella risposta. Includi solo aziende che compaiono nelle fonti. Il sito deve essere il dominio ufficiale dell'azienda (mai portali, directory o social). Non inventare dati: usa null se manca.",
      prompt: `RISPOSTA:\n${search.text}\n\nFONTI:\n${sourcesText}`,
    },
  );

  const known = new Set(
    (await db.select({ d: schema.suppliers.domain }).from(schema.suppliers).all()).map((s) => s.d).filter(Boolean),
  );
  let added = 0;
  let verifiedPhones = 0;
  const isPlatform = (site: string) => [...platformDomains].some((d) => d && site.toLowerCase().includes(d));
  const candidates = structured.candidates.filter((c) => c.website && !PORTALS.test(c.website) && !isPlatform(c.website)).slice(0, 5);
  for (const [i, c] of candidates.entries()) {
    throwIfCancelled(ctx.signal);
    ctx.progress(50 + (i / Math.max(1, candidates.length)) * 45, `Verifica dei contatti sul sito di ${c.name}`);
    let domain: string;
    try {
      domain = new URL(/^https?:\/\//i.test(c.website!) ? c.website! : `https://${c.website}`).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    // fornitore già in rubrica: si collega senza duplicarlo
    const existing = known.has(domain) ? await db.select().from(schema.suppliers).where(eq(schema.suppliers.domain, domain)).get() : undefined;
    const supplierId = existing?.id ?? newId("sup");
    const crawl = await crawlContacts(domain, ctx.signal);
    const phones = new Map<string, { snippet: string; url: string; evidencePath: string }>();
    const emails = new Map<string, { url: string; evidencePath: string }>();
    for (const p of crawl.pages) {
      for (const ph of p.phones) if (!phones.has(ph.e164)) phones.set(ph.e164, { snippet: ph.snippet, url: p.url, evidencePath: p.evidencePath });
      for (const e of p.emails) if (!emails.has(e)) emails.set(e, { url: p.url, evidencePath: p.evidencePath });
    }
    const sourceUrls = c.sources.map((n) => search.sources.find((s) => s.index === n)?.url).filter(Boolean);
    await db.transaction(async (tx) => {
      if (!existing) {
        await tx
          .insert(schema.suppliers)
          .values({
            id: supplierId,
            name: c.name,
            kind,
            city: c.city,
            website: `https://${domain}`,
            domain,
            source: "web_search",
            notes: [c.why, phones.size ? null : "Telefono da verificare: non trovato sul sito ufficiale.", sourceUrls.length ? `Fonti: ${sourceUrls.join(" ")}` : null]
              .filter(Boolean)
              .join("\n"),
          })
          .run();
        known.add(domain);
        added++;
      }
      const now = new Date().toISOString();
      for (const [e164, ev] of [...phones.entries()].slice(0, 4)) {
        const r = await tx
          .insert(schema.supplierContacts)
          .values({
            id: newId("cnt"),
            supplierId,
            type: phoneType(e164),
            value: e164,
            display: formatPhoneDisplay(e164),
            status: "verified",
            verificationMethod: "page_fetch",
            evidence: { url: ev.url, evidencePath: ev.evidencePath, snippet: ev.snippet },
            verifiedAt: now,
          })
          .onConflictDoNothing()
          .run();
        verifiedPhones += r.rowsAffected;
      }
      for (const [email, ev] of [...emails.entries()].slice(0, 3)) {
        await tx
          .insert(schema.supplierContacts)
          .values({
            id: newId("cnt"),
            supplierId,
            type: "email",
            value: email,
            display: email,
            status: "verified",
            verificationMethod: "page_fetch",
            evidence: { url: ev.url, evidencePath: ev.evidencePath },
            verifiedAt: now,
          })
          .onConflictDoNothing()
          .run();
      }
      const linked = (await tx.select().from(schema.supplierLinks).where(eq(schema.supplierLinks.quoteLineId, line.id)).all()).some(
        (l) => l.supplierId === supplierId,
      );
      if (!linked) {
        await tx
          .insert(schema.supplierLinks)
          .values({
            id: newId("lnk"),
            projectId: project.id,
            quoteLineId: line.id,
            componentId: line.componentId,
            category: component?.category ?? null,
            supplierId,
            status: "to_contact",
            notes: `Trovato con la ricerca online: ${c.why}`,
          })
          .run();
      }
    });
  }
  return { candidates: candidates.length, added, verifiedPhones, sources: search.sources.length };
};

const RfqSchema = z.object({ subject: z.string(), body: z.string() });

/** Bozza di richiesta di disponibilità e preventivo per un fornitore. Nessun invio automatico. */
export const rfqDraft: JobHandler = async (ctx) => {
  const db = getDb();
  const link = await db.select().from(schema.supplierLinks).where(eq(schema.supplierLinks.id, String(ctx.input.linkId))).get();
  if (!link?.quoteLineId) throw new Error("Collegamento non trovato");
  const { line, project, component } = await lineContext(link.quoteLineId);
  const supplier = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, link.supplierId)).get();
  if (!supplier) throw new Error("Fornitore non trovato");
  const agency = await getSetting("agency");
  const slots = component?.slotIds?.length
    ? (await db.select().from(schema.agendaSlots).where(eq(schema.agendaSlots.projectId, project.id)).all()).filter((s) => component.slotIds!.includes(s.id))
    : [];

  ctx.progress(20, "Scrittura della richiesta");
  const draft = await generateObject(
    { task: "rfq.draft", runId: ctx.runId, projectId: project.id, signal: ctx.signal },
    {
      tier: "flash",
      schema: RfqSchema,
      schemaName: "rfq",
      temperature: 0.3,
      system: `Scrivi in italiano un'email professionale e cordiale di richiesta di disponibilità e preventivo a un fornitore, per conto dell'agenzia.
Includi: tipo di evento, date e orari, luogo, numero di persone, cosa serve nel dettaglio, richiesta di disponibilità, preventivo dettagliato con IVA indicata, condizioni di cancellazione e opzione, tempi di risposta.
${project.confidential ? "Il nome del cliente è riservato: parla di 'un nostro cliente del settore'." : ""}
Firma con i dati dell'agenzia forniti. Niente segnaposto tra parentesi quadre.`,
      prompt: [
        `Fornitore: ${supplier.name}${supplier.city ? ` (${supplier.city})` : ""}`,
        `Evento: ${project.eventType ?? "evento aziendale"}${project.confidential ? "" : ` per ${project.clientName}`}, settore ${project.sector}`,
        `Date: ${project.startDate ?? "da definire"}${project.endDate && project.endDate !== project.startDate ? ` → ${project.endDate}` : ""}`,
        `Luogo: ${[project.city, project.region].filter(Boolean).join(", ") || "da definire"}`,
        `Partecipanti: ${project.paxTarget ?? "da definire"}`,
        `Cosa serve: ${line.description}${line.detail ? ` — ${line.detail}` : ""}`,
        component?.description ? `Specifiche: ${component.description}` : "",
        `Quantità: ${line.quantity} ${line.unit}${line.periods !== 1 ? ` × ${line.periods} ${line.periodUnit}` : ""}`,
        slots.length ? `Momenti della scaletta: ${slots.map((s) => `giorno ${s.day} ${s.startTime}-${s.endTime} ${s.title}`).join("; ")}` : "",
        `Agenzia: ${[agency.name, agency.contactName, agency.email, agency.phone, agency.website].filter(Boolean).join(" · ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  );
  const id = newId("rfq");
  await db.insert(schema.rfqDrafts).values({ id, linkId: link.id, subject: draft.subject, body: draft.body }).run();
  return { rfqId: id };
};
