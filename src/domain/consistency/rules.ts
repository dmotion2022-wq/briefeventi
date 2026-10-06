// Controllo di coerenza della proposta: regole deterministiche, testate.
// Ogni problema indica dove andare a correggere.

export type Severity = "error" | "warning" | "info";
export type Issue = { id: string; severity: Severity; area: string; message: string; link: string };

export type Slot = { id: string; day: number; date: string | null; kind: string; title: string; startTime: string };
export type Component = {
  id: string;
  category: string;
  title: string;
  slotIds: string[] | null;
  quantityHint: number | null;
  optional: boolean;
};
export type CateringService = { slotId: string; pax: number; service: string };
export type Night = { date: string | null; singles: number; doubles: number };

export type ConsistencyInput = {
  projectId: string;
  sector: string;
  startDate: string | null;
  endDate: string | null;
  paxTarget: number | null;
  budgetCents: number | null;
  /** il budget del cliente comprende l'IVA? (di norma no: i budget aziendali sono IVA esclusa) */
  budgetIncludesVat?: boolean | null;
  slots: Slot[];
  components: Component[];
  catering?: { services: CateringService[] } | null;
  accommodation?: { needed: boolean; nights: Night[] } | null;
  venue?: { requirements?: { plenary?: { pax: number } } } | null;
  production?: { siaeNeeded: boolean } | null;
  textForMusicCheck: string;
  quote?: { clientTotalCents: number; totalExVatCents?: number; aiEstimateShareBp: number; lineComponentIds: string[] } | null;
  componentsEstimateCents?: { min: number; max: number } | null;
};

const FOOD_SLOTS = new Set(["coffee", "lunch", "dinner", "gala"]);
// "talk show" è un formato di conversazione: non fa scattare la SIAE
const MUSIC_RE = /\b(musica|musicale|dj|band|live music|concerto|cantante|orchestra|playlist|spettacolo)\b|(?<!talk[\s-])\bshow\b/i;
const ENTERTAINMENT_RE = /\b(spettacolo|show|dj|festa|party|intrattenimento|gita|escursione|cena di gala)\b/i;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const within = (value: number, target: number, tolerance: number) => Math.abs(value - target) <= target * tolerance;
const fmtEur = (cents: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

export function checkConsistency(input: ConsistencyInput): Issue[] {
  const issues: Issue[] = [];
  const base = `/projects/${input.projectId}`;
  const add = (severity: Severity, area: string, message: string, link: string) =>
    issues.push({ id: `${area}-${issues.length + 1}`, severity, area, message, link: `${base}/${link}` });

  const slotIds = new Set(input.slots.map((s) => s.id));
  const slotName = (id: string) => {
    const s = input.slots.find((x) => x.id === id);
    return s ? `${s.title} (giorno ${s.day}, ${s.startTime})` : id;
  };

  // 1. ogni pasto della scaletta ha il suo servizio di catering e una voce di costo
  const services = input.catering?.services ?? [];
  const cateringComponents = input.components.filter((c) => c.category === "catering");
  for (const slot of input.slots.filter((s) => FOOD_SLOTS.has(s.kind))) {
    if (!services.some((s) => s.slotId === slot.id)) {
      add("error", "catering", `Pasto senza servizio di catering: ${slotName(slot.id)}`, "develop?tab=catering");
    }
    if (!cateringComponents.some((c) => c.slotIds?.includes(slot.id))) {
      add("warning", "catering", `Pasto senza voce di costo collegata: ${slotName(slot.id)}`, "develop?tab=catering");
    }
  }

  // 2. riferimenti a slot inesistenti
  for (const c of input.components) {
    for (const id of c.slotIds ?? []) {
      if (!slotIds.has(id)) add("error", "scaletta", `"${c.title}" è collegata a uno slot che non esiste più`, "develop");
    }
  }
  for (const s of services) {
    if (!slotIds.has(s.slotId)) add("error", "catering", `Servizio "${s.service}" collegato a uno slot che non esiste più`, "develop?tab=catering");
  }

  // 3. slot fuori dalle date dell'evento
  if (input.startDate && input.endDate) {
    for (const s of input.slots) {
      if (s.date && (s.date < input.startDate || s.date > input.endDate)) {
        add("warning", "scaletta", `Slot fuori dalle date dell'evento: ${slotName(s.id)} (${s.date})`, "agenda");
      }
    }
  }

  // 4-5. pernottamento: notti e camere
  const acc = input.accommodation;
  if (acc?.needed && input.startDate && input.endDate) {
    const eventNights = Math.max(0, daysBetween(input.startDate, input.endDate));
    const nights = acc.nights.length;
    if (nights < eventNights) {
      add("error", "pernottamento", `Le notti in hotel (${nights}) sono meno delle notti dell'evento (${eventNights})`, "develop?tab=accommodation");
    } else if (nights > eventNights + 1) {
      add("warning", "pernottamento", `Le notti in hotel (${nights}) superano le notti dell'evento (${eventNights}) più l'arrivo il giorno prima`, "develop?tab=accommodation");
    }
    if (input.paxTarget) {
      for (const n of acc.nights) {
        const beds = n.singles + 2 * n.doubles;
        if (!within(beds, input.paxTarget, 0.1)) {
          add("warning", "pernottamento", `Notte ${n.date ?? "n.d."}: posti letto ${beds} contro ${input.paxTarget} partecipanti`, "develop?tab=accommodation");
        }
      }
    }
  }

  // 6. partecipanti coerenti fra moduli
  if (input.paxTarget) {
    const plenary = input.venue?.requirements?.plenary?.pax;
    if (plenary && plenary < input.paxTarget) {
      add("error", "location", `La plenaria è dimensionata per ${plenary} persone ma i partecipanti sono ${input.paxTarget}`, "develop?tab=venue");
    }
    for (const s of services) {
      if (!within(s.pax, input.paxTarget, 0.15)) {
        add("warning", "catering", `"${s.service}" è per ${s.pax} persone, i partecipanti sono ${input.paxTarget}`, "develop?tab=catering");
      }
    }
  }

  // 7. musica → SIAE
  if (MUSIC_RE.test(input.textForMusicCheck)) {
    const hasSiaeComponent = input.components.some((c) => c.category === "siae");
    if (!input.production?.siaeNeeded || !hasSiaeComponent) {
      add("warning", "permessi", "C'è musica o spettacolo nella proposta ma manca la voce SIAE", "develop?tab=production");
    }
  }

  // 8. settore pharma: niente intrattenimento per operatori sanitari
  if (input.sector === "pharma" || input.sector === "medtech") {
    const fun = input.components.filter((c) => c.category === "intrattenimento" || ENTERTAINMENT_RE.test(c.title));
    if (fun.length) {
      add(
        "warning",
        "compliance",
        `Settore ${input.sector}: verifica con il compliance del cliente queste voci (${fun.map((f) => f.title).join(", ")})`,
        "develop",
      );
    }
  }

  // 9. budget
  if (input.budgetCents) {
    if (input.quote) {
      // stessa base del budget: con IVA se il budget la include, altrimenti senza l'IVA esposta
      const compared = input.budgetIncludesVat ? input.quote.clientTotalCents : (input.quote.totalExVatCents ?? input.quote.clientTotalCents);
      const label = input.budgetIncludesVat ? "IVA inclusa" : "IVA esclusa";
      const ratio = compared / input.budgetCents;
      if (ratio > 1.0001) {
        add("error", "budget", `Il preventivo (${fmtEur(compared)} ${label}) supera il budget di ${Math.round((ratio - 1) * 100)}%`, "quote");
      } else if (ratio < 0.7) {
        add("info", "budget", `Il preventivo usa solo il ${Math.round(ratio * 100)}% del budget: spazio per alzare l'esperienza`, "quote");
      }
    } else if (input.componentsEstimateCents) {
      if (input.componentsEstimateCents.min > input.budgetCents) {
        add("error", "budget", `Anche la stima minima dei costi (${fmtEur(input.componentsEstimateCents.min)}) supera il budget`, "develop");
      } else if (input.componentsEstimateCents.max > input.budgetCents) {
        add("warning", "budget", `La stima massima dei costi (${fmtEur(input.componentsEstimateCents.max)}) supera il budget`, "develop");
      }
    }
  }

  // 10. quanto del preventivo è ancora stima e cosa manca in preventivo
  if (input.quote) {
    if (input.quote.aiEstimateShareBp > 5000) {
      add("info", "preventivo", `Il ${Math.round(input.quote.aiEstimateShareBp / 100)}% dei costi è ancora stimato: chiama i fornitori prima di inviare`, "suppliers");
    }
    const inQuote = new Set(input.quote.lineComponentIds);
    const missing = input.components.filter((c) => !c.optional && !inQuote.has(c.id));
    if (missing.length && inQuote.size) {
      add("warning", "preventivo", `Componenti non presenti nel preventivo: ${missing.map((m) => m.title).join(", ")}`, "quote");
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
