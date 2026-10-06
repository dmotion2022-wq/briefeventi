import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ModuleData } from "@/ai/schemas/development";
import { eventColors, formatDayDate, isDark, loadProposal } from "./proposal-data";

// Proposta interattiva in un unico file HTML: font e immagini incorporati, funziona offline,
// si può inviare o pubblicare ovunque. Interattività in JavaScript semplice (tab, galleria,
// opzioni del budget che aggiornano il totale).

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fontFile = (pkg: string, file: string) => {
  const p = path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file);
  return fs.existsSync(p) ? fs.readFileSync(p).toString("base64") : null;
};

function brandFontFaces() {
  const faces: [string, string, string, number][] = [
    ["Instrument Sans", "instrument-sans", "instrument-sans-latin-400-normal.woff2", 400],
    ["Instrument Sans", "instrument-sans", "instrument-sans-latin-600-normal.woff2", 600],
    ["Syne", "syne", "syne-latin-700-normal.woff2", 700],
    ["Syne", "syne", "syne-latin-800-normal.woff2", 800],
    ["JetBrains Mono", "jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2", 400],
  ];
  return faces
    .map(([family, pkg, file, weight]) => {
      const data = fontFile(pkg, file);
      return data ? `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format("woff2")}` : "";
    })
    .join("\n");
}

/** Prova a incorporare i font della concept bible da Google Fonts; se non riesce si usano quelli del brand. */
async function bibleFontFaces(families: string[]) {
  const css: string[] = [];
  for (const family of [...new Set(families.filter(Boolean))]) {
    try {
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      let text = await res.text();
      // solo il sottoinsieme latino, per tenere leggero il file
      text = text
        .split("/*")
        .filter((block) => !block.trim() || block.startsWith(" latin */") || !block.includes("unicode-range"))
        .join("/*");
      for (const m of [...text.matchAll(/url\((https:[^)]+\.woff2)\)/g)]) {
        const font = await fetch(m[1], { signal: AbortSignal.timeout(8000) });
        if (!font.ok) continue;
        text = text.replace(m[1], `data:font/woff2;base64,${Buffer.from(await font.arrayBuffer()).toString("base64")}`);
      }
      if (!text.includes("https://")) css.push(text);
    } catch {
      // senza rete: si resta sui font del brand
    }
  }
  return css.join("\n");
}

async function imageData(file: string | null, width: number) {
  if (!file) return null;
  const buf = await sharp(file).resize({ width, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const SLOT_LABELS: Record<string, string> = {
  registration: "Accoglienza", plenary: "Plenaria", breakout: "Breakout", coffee: "Coffee break", lunch: "Pranzo", dinner: "Cena",
  gala: "Gala", transfer: "Transfer", activity: "Attività", networking: "Networking", free: "Tempo libero", other: "",
};

export async function buildProposalHtml(projectId: string, opts: { prices: boolean }) {
  const d = loadProposal(projectId);
  const c = eventColors(d);
  const title = d.bible?.name ?? d.concept?.name ?? d.project.title;
  const claim = d.bible?.claim ?? d.concept?.claim ?? "";
  const displayFont = d.bible?.typography.display;
  const textFont = d.bible?.typography.text;
  const extraFonts = await bibleFontFaces([displayFont ?? "", textFont ?? ""]);
  const hasDisplay = !!displayFont && extraFonts.includes(displayFont);
  const hasText = !!textFont && extraFonts.includes(textFont);

  const hero = await imageData(d.imagePath(d.keyVisual), 2000);
  const gallery = (await Promise.all(d.moodboard.map((img) => imageData(d.imagePath(img), 1400)))).filter((x): x is string => !!x);

  const days = [...new Set(d.slots.map((s) => s.day))].sort((a, b) => a - b);
  const nav: [string, string][] = [];
  const sections: string[] = [];
  const section = (id: string, label: string, html: string, dark = false) => {
    nav.push([id, label]);
    sections.push(`<section id="${id}" class="${dark ? "dark" : ""}"><div class="wrap">${html}</div></section>`);
  };
  const list = (items: string[] = []) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");

  if (d.concept) {
    section(
      "concept",
      "Concept",
      `<p class="eyebrow">Il concept</p><h2>${esc(title)}</h2><p class="claim">${esc(claim)}</p>
       ${d.concept.insight ? `<blockquote>${esc(d.concept.insight)}</blockquote>` : ""}
       <div class="cols"><div><p class="lead">${esc(d.concept.bigIdea)}</p><p>${esc(d.concept.narrative)}</p></div>
       <div class="card"><p class="eyebrow">Momenti chiave</p>${list(d.concept.experienceHighlights)}</div></div>`,
    );
  }
  const wow = d.bible?.wowMoment ?? d.concept?.wowMoment;
  if (wow) {
    section("wow", "Momento wow", `<p class="eyebrow">Il momento wow · ${esc(wow.when)}</p><h2>${esc(wow.title)}</h2><p class="lead">${esc(wow.description)}</p>`, true);
  }
  if (d.bible?.narrativeArc.length) {
    section(
      "racconto",
      "Racconto",
      `<p class="eyebrow">Dall'invito al dopo evento</p><h2>Il racconto</h2><ol class="arc">${d.bible.narrativeArc
        .map((p, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span><h3>${esc(p.phase)}</h3><p>${esc(p.description)}</p></li>`)
        .join("")}</ol>`,
    );
  }
  if (days.length) {
    section(
      "scaletta",
      "Scaletta",
      `<p class="eyebrow">Scaletta</p><h2>Giorno per giorno</h2>
       <div class="tabs" role="tablist">${days.map((day, i) => `<button role="tab" data-day="${day}" class="${i === 0 ? "on" : ""}">Giorno ${day}</button>`).join("")}</div>
       ${days
         .map((day, i) => {
           const daySlots = d.slots.filter((s) => s.day === day);
           const date = formatDayDate(daySlots.find((s) => s.date)?.date);
           return `<div class="day" data-day="${day}" ${i ? "hidden" : ""}>${date ? `<p class="muted">${esc(date)}</p>` : ""}<table class="agenda">${daySlots
             .map((s) => `<tr><td class="time">${esc(s.startTime)}–${esc(s.endTime)}</td><td class="kind">${esc(SLOT_LABELS[s.kind])}</td><td><strong>${esc(s.title)}</strong>${s.description ? `<br><span class="muted">${esc(s.description)}</span>` : ""}</td></tr>`)
             .join("")}</table></div>`;
         })
         .join("")}`,
    );
  }
  const venue = d.modules.venue;
  if (venue) {
    section(
      "location",
      "Location",
      `<p class="eyebrow">Location</p><h2>Gli spazi</h2><p class="lead">${esc(venue.summary)}</p>
       <div class="grid">${(venue.candidates ?? []).slice(0, 4).map((v) => `<div class="card"><h3>${esc(d.venueName(v.venueId) ?? v.name)}</h3><p>${esc(v.why)}</p></div>`).join("")}</div>`,
    );
  }
  const cat = d.modules.catering;
  if (cat) {
    section(
      "food",
      "Food",
      `<p class="eyebrow">Food & beverage</p><h2>Il cibo racconta il concept</h2><p class="lead">${esc(cat.foodConcept)}</p>
       <div class="grid">${(cat.services ?? []).map((s) => `<div class="card"><p class="eyebrow">${esc(d.slots.find((x) => x.id === s.slotId)?.title ?? "")}</p><h3>${esc(s.service)}</h3><p>${esc(s.formula)} · ${esc(s.menuIdea)}</p></div>`).join("")}</div>`,
    );
  }
  const eng = d.modules.engagement;
  if (eng) {
    const col = (label: string, items: ModuleData["engagement"]["before"] = []) =>
      `<div><p class="eyebrow">${label}</p>${items.map((m) => `<div class="card"><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p></div>`).join("")}</div>`;
    section("interazione", "Interazione", `<p class="eyebrow">Interazione</p><h2>Prima, durante e dopo</h2><p class="lead">${esc(eng.summary)}</p><div class="cols3">${col("Prima", eng.before)}${col("Durante", eng.during)}${col("Dopo", eng.after)}</div>`);
  }
  if (gallery.length || d.bible) {
    section(
      "identita",
      "Identità",
      `<p class="eyebrow">Identità</p><h2>Il linguaggio visivo</h2>
       ${d.bible ? `<div class="palette">${d.bible.palette.map((p) => `<div><span style="background:${esc(p.hex)}"></span><strong>${esc(p.name)}</strong><code>${esc(p.hex)}</code></div>`).join("")}</div><p>${esc(d.bible.tone)}</p>` : ""}
       ${gallery.length ? `<div class="gallery">${gallery.map((src, i) => `<button class="thumb" data-i="${i}"><img src="${src}" alt="Moodboard ${i + 1}" loading="lazy"></button>`).join("")}</div>` : ""}`,
    );
  }

  // Budget con opzioni attivabili (solo se si sceglie di mostrare i prezzi)
  if (opts.prices && d.quote) {
    const t = d.quote.totals;
    const eur = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
    const optional = d.quote.lines.filter((l) => !t.lines.find((r) => r.id === l.id)?.included);
    const optionRows = optional.map((l) => {
      const r = t.lines.find((x) => x.id === l.id)!;
      const vat = r.regime.kind === "standard" ? Math.round((r.priceCents * r.regime.rateBp) / 10000) : 0;
      return `<label class="opt"><input type="checkbox" data-cents="${r.priceCents + vat}"> ${esc(l.description)} <span>${eur(r.priceCents)} + IVA</span></label>`;
    });
    section(
      "budget",
      "Budget",
      `<p class="eyebrow">Investimento</p><h2>Il budget</h2>
       <table class="budget">${t.sections.filter((s) => !s.optional && s.priceCents > 0).map((s) => `<tr><td>${esc(s.title)}</td><td>${eur(s.priceCents)}</td></tr>`).join("")}
       ${t.agencyFeeCents ? `<tr><td>Fee d'agenzia</td><td>${eur(t.agencyFeeCents)}</td></tr>` : ""}
       ${t.contingencyMode === "client_line" && t.contingencyCents ? `<tr><td>Imprevisti e variazioni</td><td>${eur(t.contingencyCents)}</td></tr>` : ""}
       ${t.standardVatCents ? `<tr><td class="muted">IVA</td><td>${eur(t.standardVatCents)}</td></tr>` : ""}
       <tr class="total"><td>Totale (IVA inclusa dove dovuta)</td><td id="total" data-base="${t.clientTotalCents}">${eur(t.clientTotalCents)}</td></tr></table>
       ${optionRows.length ? `<p class="eyebrow">Opzioni</p>${optionRows.join("")}` : ""}
       <p class="muted">Riferimento ${esc(d.quote.quote.number)} · validità ${d.quote.quote.validityDays} giorni.</p>`,
    );
  }
  section(
    "contatti",
    "Contatti",
    `<h2>Grazie</h2><p class="lead">${esc(d.agency.brand || d.agency.name)}</p><p>${[d.agency.contactName, d.agency.email, d.agency.phone, d.agency.website].filter(Boolean).map(esc).join("<br>")}</p>`,
    true,
  );

  const onDark = isDark(`#${c.dark}`) ? "#fff" : "#191521";
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(d.project.clientName)}</title>
<style>
${brandFontFaces()}
${extraFonts}
:root{--primary:#${c.primary};--accent:#${c.accent};--dark:#${c.dark};--light:#${c.light};--ink:#191521;--muted:#6B6478;--line:#E3E0D9;
--display:${hasDisplay ? `"${displayFont}",` : ""}"Syne","Instrument Sans",system-ui,sans-serif;--text:${hasText ? `"${textFont}",` : ""}"Instrument Sans",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:var(--text);color:var(--ink);background:var(--light);font-size:17px;line-height:1.6}
.wrap{max-width:1080px;margin:0 auto;padding:0 28px}
header.hero{min-height:92vh;display:flex;align-items:flex-end;color:#fff;background:var(--dark) ${hero ? `url(${hero}) center/cover` : ""};position:relative}
header.hero:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.65))}
header.hero .wrap{position:relative;padding-bottom:72px;width:100%}
header.hero h1{font-family:var(--display);font-size:clamp(44px,8vw,96px);line-height:1;margin:.15em 0 .2em;font-weight:800;letter-spacing:-.02em}
header.hero .claim{font-size:clamp(20px,2.4vw,28px);font-style:italic;margin:0 0 28px;color:#fff}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
header.hero .eyebrow{color:#fff;opacity:.9}
nav{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
nav .wrap{display:flex;gap:22px;overflow-x:auto;padding-top:14px;padding-bottom:14px}
nav a{color:var(--ink);text-decoration:none;font-size:14px;white-space:nowrap}nav a:hover{color:var(--primary)}
section{padding:96px 0}section.dark{background:var(--dark);color:${onDark}}section.dark .eyebrow{color:var(--accent)}
h2{font-family:var(--display);font-size:clamp(32px,4.5vw,54px);line-height:1.05;margin:0 0 18px;letter-spacing:-.01em}
h3{font-family:var(--display);font-size:20px;margin:0 0 6px}
.claim{font-size:22px;font-style:italic;color:var(--primary)}
.lead{font-size:21px;line-height:1.5;max-width:780px}
blockquote{font-family:var(--display);font-size:clamp(24px,3vw,34px);line-height:1.25;border-left:6px solid var(--accent);margin:36px 0;padding:4px 0 4px 24px}
.cols{display:grid;grid-template-columns:1.4fr 1fr;gap:40px}.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;margin-top:24px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:14px;color:var(--ink)}
.arc{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px}
.arc li{border-top:5px solid var(--primary);padding-top:14px}.arc li:nth-child(even){border-color:var(--accent)}
.arc span{font-family:var(--mono);color:var(--primary);font-weight:700}
.tabs{display:flex;gap:8px;margin:20px 0}.tabs button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 18px;cursor:pointer}
.tabs button.on{background:var(--primary);color:#fff;border-color:var(--primary)}
table{width:100%;border-collapse:collapse}td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.agenda .time{font-family:var(--mono);color:var(--primary);white-space:nowrap;font-weight:700;width:130px}.agenda .kind{font-family:var(--mono);font-size:12px;color:var(--muted);width:120px}
.muted{color:var(--muted)}
.palette{display:flex;flex-wrap:wrap;gap:18px;margin:20px 0}.palette div{width:130px}.palette span{display:block;height:84px;border-radius:12px;border:1px solid var(--line)}
.palette code{display:block;font-family:var(--mono);font-size:12px;color:var(--muted)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:28px}
.thumb{border:0;padding:0;background:none;cursor:zoom-in}.thumb img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;display:block}
.budget td:last-child{text-align:right;font-family:var(--mono)}.budget .total td{font-weight:700;background:var(--primary);color:#fff}
.opt{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line)}.opt span{margin-left:auto;font-family:var(--mono);color:var(--muted)}
#lightbox{position:fixed;inset:0;background:rgba(0,0,0,.9);display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out}
#lightbox img{max-width:92vw;max-height:92vh;border-radius:8px}#lightbox.on{display:flex}
footer{padding:28px 0;font-family:var(--mono);font-size:12px;color:var(--muted)}
.spectrum{height:5px;background:linear-gradient(100deg,#6C4DF6,#ED3E7E 58%,#FFAD47)}
@media (max-width:760px){.cols,.cols3{grid-template-columns:1fr}section{padding:64px 0}}
@page{size:A4 landscape;margin:0}
@media print{nav,#lightbox,.tabs,footer,.spectrum{display:none}.day[hidden]{display:block!important}
body{font-size:14px}header.hero{min-height:100vh}section{min-height:100vh;break-before:page;padding:48px 0}
.wrap{max-width:none;padding:0 56px}h2{font-size:40px}.lead{font-size:18px}.gallery{grid-template-columns:repeat(3,1fr)}}
</style>
</head>
<body>
<header class="hero"><div class="wrap">
<p class="eyebrow">${esc(d.project.clientName)} · ${esc(d.project.eventType ?? "evento")}${d.project.startDate ? ` · ${esc(formatDayDate(d.project.startDate))}` : ""}${d.project.city ? ` · ${esc(d.project.city)}` : ""}</p>
<h1>${esc(title)}</h1><p class="claim">${esc(claim)}</p>
<p class="eyebrow">Una proposta di ${esc(d.agency.brand || d.agency.name)}</p>
</div></header>
<nav><div class="wrap">${nav.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join("")}</div></nav>
${sections.join("\n")}
<div class="spectrum"></div>
<footer><div class="wrap">${esc(d.agency.name)} · ${new Date().toLocaleDateString("it-IT")}</div></footer>
<div id="lightbox"><img alt=""></div>
<script>
document.querySelectorAll(".tabs button").forEach(function(b){b.addEventListener("click",function(){
document.querySelectorAll(".tabs button").forEach(function(x){x.classList.toggle("on",x===b)});
document.querySelectorAll(".day").forEach(function(d){d.hidden=d.dataset.day!==b.dataset.day});});});
var lb=document.getElementById("lightbox");
document.querySelectorAll(".thumb").forEach(function(t){t.addEventListener("click",function(){lb.querySelector("img").src=t.querySelector("img").src;lb.classList.add("on");});});
lb.addEventListener("click",function(){lb.classList.remove("on")});
var total=document.getElementById("total");
if(total){var fmt=new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"});
document.querySelectorAll(".opt input").forEach(function(cb){cb.addEventListener("change",function(){
var sum=Number(total.dataset.base);document.querySelectorAll(".opt input:checked").forEach(function(x){sum+=Number(x.dataset.cents)});
total.textContent=fmt.format(sum/100);});});}
</script>
</body>
</html>`;
  const safeName = `${title} - ${d.project.clientName}`.replace(/[\\/:*?"<>|]/g, "-");
  return { html, filename: `${safeName}.html` };
}
