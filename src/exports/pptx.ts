import PptxGenJS from "pptxgenjs";
import { brand } from "@/brand/tokens";
import { eventColors, formatDayDate, isDark, loadProposal, type ProposalData } from "./proposal-data";

// Presentazione modificabile (.pptx) su due livelli: la cornice Factory Studios
// (piè di pagina, numerazione, barra spectrum) e l'identità dell'evento dalla concept bible.

const W = 13.333;
const H = 7.5;
const M = 0.6; // margine

type Fonts = { head: string; body: string; mono: string };

const SLOT_LABELS: Record<string, string> = {
  registration: "Accoglienza",
  plenary: "Plenaria",
  breakout: "Breakout",
  coffee: "Coffee break",
  lunch: "Pranzo",
  dinner: "Cena",
  gala: "Gala",
  transfer: "Transfer",
  activity: "Attività",
  networking: "Networking",
  free: "Tempo libero",
  other: "",
};

export async function buildProposalPptx(projectId: string, opts: { prices: boolean; safeFonts: boolean }) {
  const d = loadProposal(projectId);
  const c = eventColors(d);
  const fonts: Fonts = opts.safeFonts
    ? { head: brand.fonts.safeSans, body: brand.fonts.safeSans, mono: brand.fonts.safeMono }
    : { head: d.bible?.typography.display || brand.fonts.sans, body: d.bible?.typography.text || brand.fonts.sans, mono: brand.fonts.mono };
  const title = d.bible?.name ?? d.concept?.name ?? d.project.title;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = d.agency.name;
  pptx.company = d.agency.brand || d.agency.name;
  pptx.title = `${title} · ${d.project.clientName}`;

  const footer = (slide: PptxGenJS.Slide, dark: boolean, n: number) => {
    const color = dark ? "C9C5D0" : "6B6478";
    slide.addShape("rect", { x: 0, y: H - 0.06, w: W / 3, h: 0.06, fill: { color: brand.spectrum[0].slice(1) }, line: { type: "none" } });
    slide.addShape("rect", { x: W / 3, y: H - 0.06, w: W / 3, h: 0.06, fill: { color: brand.spectrum[1].slice(1) }, line: { type: "none" } });
    slide.addShape("rect", { x: (2 * W) / 3, y: H - 0.06, w: W / 3, h: 0.06, fill: { color: brand.spectrum[2].slice(1) }, line: { type: "none" } });
    slide.addText(`${d.agency.brand || d.agency.name} · ${title}`, { x: M, y: H - 0.45, w: 8, h: 0.3, fontFace: fonts.mono, fontSize: 8, color, charSpacing: 1 });
    slide.addText(String(n), { x: W - M - 1, y: H - 0.45, w: 1, h: 0.3, fontFace: fonts.mono, fontSize: 8, color, align: "right" });
  };

  let n = 0;
  const add = (opts2: { dark?: boolean; eyebrow?: string; heading?: string; notes?: string } = {}) => {
    n++;
    const slide = pptx.addSlide();
    const bg = opts2.dark ? c.dark : c.light;
    slide.background = { color: bg };
    const fg = isDark(`#${bg}`) ? "FFFFFF" : brand.ink.slice(1);
    if (opts2.eyebrow) {
      slide.addText(opts2.eyebrow.toUpperCase(), { x: M, y: 0.45, w: W - 2 * M, h: 0.3, fontFace: fonts.mono, fontSize: 10, color: c.accent, charSpacing: 2, bold: true });
    }
    if (opts2.heading) {
      slide.addText(opts2.heading, { x: M, y: 0.75, w: W - 2 * M, h: 0.9, fontFace: fonts.head, fontSize: 30, bold: true, color: fg, valign: "top" });
    }
    if (opts2.notes) slide.addNotes(opts2.notes);
    footer(slide, isDark(`#${bg}`), n);
    return { slide, fg };
  };
  const bullets = (items: string[], size = 14, color = brand.ink.slice(1)) =>
    items.filter(Boolean).map((t) => ({ text: t, options: { bullet: { code: "25AA" }, fontSize: size, color, paraSpaceAfter: 6, breakLine: true } }));

  // 1. Copertina
  {
    n++;
    const slide = pptx.addSlide();
    slide.background = { color: c.dark };
    const kv = d.imagePath(d.keyVisual);
    if (kv) {
      slide.addImage({ path: kv, x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
      slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "000000", transparency: 45 }, line: { type: "none" } });
    }
    slide.addText(`${d.project.clientName.toUpperCase()} · ${(d.project.eventType ?? "evento").toUpperCase()}`, {
      x: M, y: 4.2, w: W - 2 * M, h: 0.35, fontFace: fonts.mono, fontSize: 11, color: "FFFFFF", charSpacing: 3,
    });
    slide.addText(title, { x: M, y: 4.55, w: W - 2 * M, h: 1.2, fontFace: fonts.head, fontSize: 54, bold: true, color: "FFFFFF", valign: "top" });
    if (d.bible?.claim ?? d.concept?.claim) {
      slide.addText(d.bible?.claim ?? d.concept?.claim ?? "", { x: M, y: 5.75, w: W - 2 * M, h: 0.6, fontFace: fonts.body, fontSize: 20, italic: true, color: "FFFFFF" });
    }
    const when = [formatDayDate(d.project.startDate), d.project.city].filter(Boolean).join(" · ");
    slide.addText(`${when ? `${when}   ·   ` : ""}Proposta di ${d.agency.brand || d.agency.name}`, { x: M, y: 6.55, w: W - 2 * M, h: 0.35, fontFace: fonts.mono, fontSize: 10, color: "EDEAE3" });
    if (d.concept?.whyItWins) slide.addNotes(`Perché vince: ${d.concept.whyItWins}`);
  }

  // 2. Il brief in sintesi
  if (d.brief) {
    const { slide } = add({ eyebrow: "Il brief", heading: "Cosa ci avete chiesto" });
    slide.addText(d.brief.summary, { x: M, y: 1.8, w: 6.6, h: 2.2, fontFace: fonts.body, fontSize: 15, color: brand.ink.slice(1), valign: "top" });
    slide.addText(bullets(d.brief.objectives.slice(0, 6), 13), { x: M, y: 4.1, w: 6.6, h: 2.6, fontFace: fonts.body, valign: "top" });
    const facts = [
      ["Partecipanti", d.project.paxTarget ? `${d.project.paxTarget}` : "da definire"],
      ["Quando", formatDayDate(d.project.startDate) ?? "da definire"],
      ["Dove", [d.project.city, d.project.region].filter(Boolean).join(", ") || "da definire"],
      ["Pubblico", d.brief.audience.profiles.join(", ") || d.brief.audience.description || "—"],
      ["Formato", d.brief.format.replace("_", " ")],
    ];
    facts.forEach(([k, v], i) => {
      slide.addText(k.toUpperCase(), { x: 7.8, y: 1.85 + i * 0.95, w: 4.9, h: 0.3, fontFace: fonts.mono, fontSize: 9, color: c.primary, charSpacing: 2 });
      slide.addText(v, { x: 7.8, y: 2.12 + i * 0.95, w: 4.9, h: 0.55, fontFace: fonts.body, fontSize: 15, bold: true, color: brand.ink.slice(1), valign: "top" });
    });
  }

  // 3. Insight
  if (d.concept?.insight) {
    const { slide } = add({ dark: true, eyebrow: "L'insight" });
    slide.addText(`“${d.concept.insight}”`, { x: M + 0.4, y: 1.6, w: W - 2 * M - 0.8, h: 4, fontFace: fonts.head, fontSize: 32, color: "FFFFFF", valign: "middle" });
  }

  // 4. Il concept
  if (d.concept) {
    const { slide } = add({ eyebrow: "Il concept", notes: d.concept.whyItWins });
    slide.addText(d.bible?.name ?? d.concept.name, { x: M, y: 1.1, w: W - 2 * M, h: 1.1, fontFace: fonts.head, fontSize: 48, bold: true, color: c.primary });
    slide.addText(d.bible?.claim ?? d.concept.claim, { x: M, y: 2.2, w: W - 2 * M, h: 0.6, fontFace: fonts.body, fontSize: 22, italic: true, color: brand.ink.slice(1) });
    slide.addText(d.concept.bigIdea, { x: M, y: 3.1, w: 7.4, h: 2.6, fontFace: fonts.body, fontSize: 16, color: brand.ink.slice(1), valign: "top" });
    slide.addText(bullets(d.concept.experienceHighlights.slice(0, 5), 13), { x: 8.4, y: 3.1, w: 4.3, h: 3.2, fontFace: fonts.body, valign: "top" });
  }

  // 5. Arco narrativo
  if (d.bible?.narrativeArc.length) {
    const { slide } = add({ eyebrow: "Il racconto", heading: "Dall'invito al dopo evento" });
    const phases = d.bible.narrativeArc.slice(0, 5);
    const colW = (W - 2 * M - (phases.length - 1) * 0.25) / phases.length;
    phases.forEach((p, i) => {
      const x = M + i * (colW + 0.25);
      slide.addShape("rect", { x, y: 2.0, w: colW, h: 0.08, fill: { color: i % 2 ? c.accent : c.primary }, line: { type: "none" } });
      slide.addText(`${String(i + 1).padStart(2, "0")}`, { x, y: 2.2, w: colW, h: 0.5, fontFace: fonts.mono, fontSize: 14, color: c.primary, bold: true });
      slide.addText(p.phase, { x, y: 2.7, w: colW, h: 0.8, fontFace: fonts.head, fontSize: 17, bold: true, color: brand.ink.slice(1), valign: "top" });
      slide.addText(p.description, { x, y: 3.5, w: colW, h: 3, fontFace: fonts.body, fontSize: 12, color: "2E2740", valign: "top" });
    });
  }

  // 6. Momento wow
  const wow = d.bible?.wowMoment ?? d.concept?.wowMoment;
  if (wow) {
    const { slide } = add({ dark: true, eyebrow: `Il momento wow · ${wow.when}`, notes: d.concept?.wowMoment.feasibility ? `Fattibilità: ${d.concept.wowMoment.feasibility}` : undefined });
    const img = d.imagePath(d.moodboard[0]);
    const textW = img ? 6.3 : W - 2 * M;
    slide.addText(wow.title, { x: M, y: 1.0, w: textW, h: 1.6, fontFace: fonts.head, fontSize: 36, bold: true, color: "FFFFFF", valign: "top" });
    slide.addText(wow.description, { x: M, y: 2.8, w: textW, h: 3.4, fontFace: fonts.body, fontSize: 16, color: "EDEAE3", valign: "top" });
    if (img) slide.addImage({ path: img, x: 7.3, y: 0.9, w: 5.4, h: 5.6, sizing: { type: "cover", w: 5.4, h: 5.6 } });
  }

  // 7. Key visual e moodboard
  const mood = [d.keyVisual, ...d.moodboard].map((i) => d.imagePath(i)).filter((p): p is string => !!p).slice(0, 6);
  if (mood.length) {
    const { slide } = add({ eyebrow: "Atmosfera", heading: "Key visual e moodboard" });
    const cols = mood.length > 3 ? 3 : mood.length;
    const rows = Math.ceil(mood.length / cols);
    const gw = (W - 2 * M - (cols - 1) * 0.2) / cols;
    const gh = (H - 2.2 - 0.7 - (rows - 1) * 0.2) / rows;
    mood.forEach((p, i) => {
      const x = M + (i % cols) * (gw + 0.2);
      const y = 1.9 + Math.floor(i / cols) * (gh + 0.2);
      slide.addImage({ path: p, x, y, w: gw, h: gh, sizing: { type: "cover", w: gw, h: gh } });
    });
  }

  // 8. Identità grafica
  if (d.bible) {
    const b = d.bible;
    const { slide } = add({ eyebrow: "Identità", heading: "Il linguaggio visivo dell'evento" });
    b.palette.slice(0, 6).forEach((p, i) => {
      const x = M + i * 2.0;
      const hex = p.hex.replace("#", "").toUpperCase();
      slide.addShape("rect", { x, y: 1.9, w: 1.8, h: 1.4, fill: { color: /^[0-9A-F]{6}$/.test(hex) ? hex : "CCCCCC" }, line: { color: "E3E0D9", width: 0.5 } });
      slide.addText(`${p.name}\n#${hex}\n${p.role}`, { x, y: 3.35, w: 1.8, h: 0.9, fontFace: fonts.mono, fontSize: 9, color: brand.ink.slice(1), valign: "top" });
    });
    slide.addText(
      [
        { text: "Tipografia  ", options: { bold: true } },
        { text: `${b.typography.display} per i titoli, ${b.typography.text} per i testi. ${b.typography.notes}`, options: { breakLine: true } },
        { text: "Tono  ", options: { bold: true } },
        { text: `${b.tone} (${b.toneWords.join(", ")})`, options: { breakLine: true } },
        { text: "Declinazioni  ", options: { bold: true } },
        { text: b.applications.join(" · ") },
      ],
      { x: M, y: 4.5, w: W - 2 * M, h: 2.2, fontFace: fonts.body, fontSize: 13, color: brand.ink.slice(1), valign: "top", paraSpaceAfter: 8 },
    );
  }

  // 9. Location e sale
  const venue = d.modules.venue;
  if (venue) {
    const { slide } = add({ eyebrow: "Location", heading: "Gli spazi dell'esperienza" });
    slide.addText(venue.summary ?? "", { x: M, y: 1.8, w: 6.6, h: 1.5, fontFace: fonts.body, fontSize: 14, color: brand.ink.slice(1), valign: "top" });
    const req = venue.requirements ?? {};
    slide.addText(
      bullets(
        [
          req.plenary ? `Plenaria: ${req.plenary.pax} persone, ${req.plenary.setup}` : "",
          ...(req.breakouts ?? []).map((b) => `${b.count} sale breakout da ${b.pax} persone (${b.setup})`),
          ...(req.otherSpaces ?? []).slice(0, 3),
        ],
        13,
      ),
      { x: M, y: 3.4, w: 6.6, h: 3.2, fontFace: fonts.body, valign: "top" },
    );
    const cands = (venue.candidates ?? []).slice(0, 4);
    cands.forEach((cand, i) => {
      const y = 1.85 + i * 1.2;
      slide.addShape("rect", { x: 7.6, y, w: 5.1, h: 1.05, fill: { color: "FFFFFF" }, line: { color: "E3E0D9", width: 0.5 } });
      slide.addText(d.venueName(cand.venueId) ?? cand.name, { x: 7.75, y: y + 0.08, w: 4.8, h: 0.35, fontFace: fonts.head, fontSize: 13, bold: true, color: c.primary });
      slide.addText(cand.why ?? "", { x: 7.75, y: y + 0.42, w: 4.8, h: 0.6, fontFace: fonts.body, fontSize: 10, color: "2E2740", valign: "top" });
    });
  }

  // 10. Scaletta (una slide per giorno, divisa se lunga)
  const days = [...new Set(d.slots.map((s) => s.day))].sort((a, b) => a - b);
  for (const day of days) {
    const daySlots = d.slots.filter((s) => s.day === day);
    for (let page = 0; page * 11 < daySlots.length; page++) {
      const chunk = daySlots.slice(page * 11, page * 11 + 11);
      const date = daySlots.find((s) => s.date)?.date;
      const { slide } = add({ eyebrow: `Scaletta · giorno ${day}${page ? " (segue)" : ""}`, heading: formatDayDate(date) ?? `Giorno ${day}` });
      const rows: PptxGenJS.TableRow[] = chunk.map((s) => [
        { text: `${s.startTime}–${s.endTime}`, options: { fontFace: fonts.mono, fontSize: 11, color: c.primary, bold: true } },
        { text: SLOT_LABELS[s.kind] ?? "", options: { fontFace: fonts.mono, fontSize: 9, color: "6B6478" } },
        { text: s.title, options: { fontFace: fonts.body, fontSize: 13, bold: true, color: brand.ink.slice(1) } },
        { text: s.room ?? "", options: { fontFace: fonts.body, fontSize: 10, color: "6B6478" } },
      ]);
      slide.addTable(rows, { x: M, y: 1.8, w: W - 2 * M, colW: [1.7, 1.5, 7.3, 1.63], border: { type: "solid", color: "E3E0D9", pt: 0.5 }, rowH: 0.42, valign: "middle" });
    }
  }

  // 11. Ospitalità
  const acc = d.modules.accommodation;
  if (acc?.needed) {
    const { slide } = add({ eyebrow: "Ospitalità", heading: "Dove dormono i partecipanti" });
    slide.addText(acc.summary ?? "", { x: M, y: 1.8, w: 7, h: 1.6, fontFace: fonts.body, fontSize: 14, color: brand.ink.slice(1), valign: "top" });
    slide.addText(
      bullets([`Categoria: ${acc.category}`, `Posizione: ${acc.location}`, ...(acc.nights ?? []).map((n, i) => `${n.date ?? `Notte ${i + 1}`}: ${n.singles} singole/DUS, ${n.doubles} doppie`)], 13),
      { x: M, y: 3.5, w: 7, h: 3, fontFace: fonts.body, valign: "top" },
    );
    slide.addText(bullets((acc.candidates ?? []).slice(0, 4).map((h) => `${d.venueName(h.venueId) ?? h.name}: ${h.why}`), 12), { x: 8, y: 1.8, w: 4.7, h: 4.8, fontFace: fonts.body, valign: "top" });
  }

  // 12. Food & beverage
  const cat = d.modules.catering;
  if (cat) {
    const { slide } = add({ eyebrow: "Food & beverage", heading: "Il cibo racconta il concept" });
    slide.addText(cat.foodConcept ?? "", { x: M, y: 1.75, w: W - 2 * M, h: 0.9, fontFace: fonts.body, fontSize: 14, italic: true, color: brand.ink.slice(1), valign: "top" });
    const rows: PptxGenJS.TableRow[] = (cat.services ?? []).slice(0, 8).map((s) => {
      const slot = d.slots.find((x) => x.id === s.slotId);
      return [
        { text: slot ? `G${slot.day} · ${slot.startTime}` : "", options: { fontFace: fonts.mono, fontSize: 10, color: c.primary, bold: true } },
        { text: s.service, options: { fontFace: fonts.body, fontSize: 12, bold: true } },
        { text: `${s.formula} · ${s.menuIdea}`, options: { fontFace: fonts.body, fontSize: 10, color: "2E2740" } },
      ];
    });
    if (rows.length) slide.addTable(rows, { x: M, y: 2.75, w: W - 2 * M, colW: [1.6, 3, 7.53], border: { type: "solid", color: "E3E0D9", pt: 0.5 }, valign: "middle" });
  }

  // 13. Percorso di engagement
  const eng = d.modules.engagement;
  if (eng) {
    const { slide } = add({ eyebrow: "Interazione", heading: "Prima, durante e dopo" });
    (["before", "during", "after"] as const).forEach((phase, i) => {
      const x = M + i * 4.1;
      slide.addText(["Prima", "Durante", "Dopo"][i].toUpperCase(), { x, y: 1.8, w: 3.9, h: 0.35, fontFace: fonts.mono, fontSize: 11, bold: true, color: c.accent, charSpacing: 2 });
      const runs: PptxGenJS.TextProps[] = (eng[phase] ?? []).slice(0, 3).flatMap((m) => [
        { text: `${m.name}: `, options: { bold: true, fontSize: 12 } },
        { text: m.description, options: { fontSize: 11, breakLine: true, paraSpaceAfter: 8 } },
      ]);
      slide.addText(
        runs,
        { x, y: 2.2, w: 3.9, h: 3.4, fontFace: fonts.body, color: brand.ink.slice(1), valign: "top" },
      );
    });
    const kpis = (eng.measurement?.kpis ?? []).slice(0, 4).map((k) => `${k.name} — ${k.how}`);
    if (kpis.length) slide.addText(`Come lo misuriamo: ${kpis.join(" · ")}`, { x: M, y: 5.8, w: W - 2 * M, h: 0.9, fontFace: fonts.body, fontSize: 11, color: "6B6478", valign: "top" });
  }

  // 14. Produzione e servizi
  const prod = d.modules.production;
  if (prod) {
    const { slide } = add({ eyebrow: "Produzione", heading: "Tutto ciò che fa funzionare l'evento" });
    const cols: [string, string[]][] = [
      ["Audio, video, luci", prod.av ?? []],
      ["Allestimenti", prod.staging ?? []],
      ["Staff e trasporti", [...(prod.staff ?? []).map((s) => `${s.count} × ${s.role}`), ...(prod.transport ?? []).map((t) => t.what)]],
    ];
    cols.forEach(([label, items], i) => {
      const x = M + i * 4.1;
      slide.addText(label.toUpperCase(), { x, y: 1.8, w: 3.9, h: 0.35, fontFace: fonts.mono, fontSize: 10, bold: true, color: c.primary, charSpacing: 2 });
      slide.addText(bullets(items.slice(0, 7), 12), { x, y: 2.2, w: 3.9, h: 4.4, fontFace: fonts.body, valign: "top" });
    });
  }

  // 15. Sostenibilità e compliance
  const sustain = [...(prod?.sustainability ?? []), ...(cat?.sustainability ?? [])].slice(0, 6);
  const compliance = [...(acc?.rules ?? []), ...(d.brief?.constraints ?? [])].slice(0, 6);
  if (sustain.length || compliance.length) {
    const { slide } = add({ eyebrow: "Responsabilità", heading: "Sostenibilità e compliance" });
    slide.addText(bullets(sustain, 13), { x: M, y: 1.8, w: 5.9, h: 4.8, fontFace: fonts.body, valign: "top" });
    slide.addText(bullets(compliance, 13), { x: 6.8, y: 1.8, w: 5.9, h: 4.8, fontFace: fonts.body, valign: "top" });
  }

  // 16. Budget (facoltativo: per le gare spesso va nella busta economica)
  if (opts.prices && d.quote) {
    const t = d.quote.totals;
    const { slide } = add({ eyebrow: "Investimento", heading: "Il budget in sintesi" });
    const eur = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
    const rows: PptxGenJS.TableRow[] = t.sections
      .filter((s) => !s.optional && s.priceCents > 0)
      .map((s) => [
        { text: s.title, options: { fontFace: fonts.body, fontSize: 12 } },
        { text: eur(s.priceCents), options: { fontFace: fonts.mono, fontSize: 12, align: "right" } },
      ]);
    const extra: [string, number][] = [
      ["Fee d'agenzia", t.agencyFeeCents],
      ["Imprevisti e variazioni", t.contingencyMode === "client_line" ? t.contingencyCents : 0],
      ["IVA", t.standardVatCents],
    ];
    for (const [label, cents] of extra) {
      if (!cents) continue;
      rows.push([
        { text: label, options: { fontFace: fonts.body, fontSize: 12, color: "6B6478" } },
        { text: eur(cents), options: { fontFace: fonts.mono, fontSize: 12, align: "right", color: "6B6478" } },
      ]);
    }
    rows.push([
      { text: "Totale (IVA inclusa dove dovuta)", options: { fontFace: fonts.body, fontSize: 13, bold: true, color: "FFFFFF", fill: { color: c.primary } } },
      { text: eur(t.clientTotalCents), options: { fontFace: fonts.mono, fontSize: 13, bold: true, align: "right", color: "FFFFFF", fill: { color: c.primary } } },
    ]);
    slide.addTable(rows, { x: M, y: 1.8, w: 8, colW: [5.6, 2.4], border: { type: "solid", color: "E3E0D9", pt: 0.5 } });
    slide.addText(`Riferimento ${d.quote.quote.number} del ${new Date(d.quote.quote.date).toLocaleDateString("it-IT")}, validità ${d.quote.quote.validityDays} giorni. Dettaglio nel preventivo allegato.`, {
      x: 9, y: 1.8, w: 3.7, h: 2, fontFace: fonts.body, fontSize: 11, color: "6B6478", valign: "top",
    });
  }

  // 17. Prossimi passi
  {
    const { slide } = add({ eyebrow: "Prossimi passi", heading: "Come procediamo insieme" });
    slide.addText(
      bullets(["Confronto sulla proposta e sui punti aperti", "Sopralluogo della location e conferma delle opzioni", "Conferma del preventivo e avvio della produzione", "Piano di comunicazione ai partecipanti"], 15),
      { x: M, y: 1.8, w: 6.5, h: 4.5, fontFace: fonts.body, valign: "top" },
    );
  }

  // 18. Contatti
  {
    const { slide } = add({ dark: true });
    slide.addText("Grazie", { x: M, y: 1.6, w: W - 2 * M, h: 1.4, fontFace: fonts.head, fontSize: 60, bold: true, color: "FFFFFF" });
    slide.addText([d.agency.brand || d.agency.name, d.agency.contactName, d.agency.email, d.agency.phone, d.agency.website].filter(Boolean).join("\n"), {
      x: M, y: 3.4, w: 8, h: 2.5, fontFace: fonts.body, fontSize: 16, color: "EDEAE3", valign: "top",
    });
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const safeName = `${title} - ${d.project.clientName}`.replace(/[\\/:*?"<>|]/g, "-");
  return { buffer, filename: `${safeName}.pptx`, data: d as ProposalData };
}
