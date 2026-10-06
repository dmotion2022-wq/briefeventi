import { eq } from "drizzle-orm";
import { agendaSlotsOf, latestBrief } from "@/ai/context";
import { getDb, schema } from "@/db/client";
import { computeForQuote, currentQuote } from "@/db/queries/quotes";
import { checkConsistency, type ConsistencyInput } from "./rules";

/** Raccoglie dal database tutto ciò che serve al controllo di coerenza di un progetto. */
export function consistencyFor(projectId: string) {
  const db = getDb();
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return null;
  const slots = agendaSlotsOf(projectId);
  const modules = new Map<string, unknown>(db.select().from(schema.modules).where(eq(schema.modules.projectId, projectId)).all().map((m) => [m.kind, m.data]));
  const components = db.select().from(schema.components).where(eq(schema.components.projectId, projectId)).all();
  const quote = currentQuote(projectId);
  const computed = quote ? computeForQuote(quote.id) : null;
  const estimate = components.reduce(
    (acc, c) => {
      const e = (c.specs as { estimate?: { minCents: number; maxCents: number } } | null)?.estimate;
      if (e && !c.optional) {
        acc.min += e.minCents;
        acc.max += e.maxCents;
      }
      return acc;
    },
    { min: 0, max: 0 },
  );
  const text = [
    ...slots.map((s) => `${s.title} ${s.description ?? ""}`),
    ...components.map((c) => `${c.title} ${c.description ?? ""}`),
    JSON.stringify(modules.get("engagement") ?? ""),
  ].join(" ");

  const input: ConsistencyInput = {
    projectId,
    sector: project.sector,
    startDate: project.startDate,
    endDate: project.endDate,
    paxTarget: project.paxTarget,
    budgetCents: project.budgetCents,
    budgetIncludesVat: (latestBrief(projectId)?.data as { budget?: { vatIncluded?: boolean | null } } | undefined)?.budget?.vatIncluded ?? false,
    slots: slots.map((s) => ({ id: s.id, day: s.day, date: s.date, kind: s.kind, title: s.title, startTime: s.startTime })),
    components: components.map((c) => ({ id: c.id, category: c.category, title: c.title, slotIds: c.slotIds, quantityHint: c.quantityHint, optional: c.optional })),
    catering: modules.get("catering") as ConsistencyInput["catering"],
    accommodation: modules.get("accommodation") as ConsistencyInput["accommodation"],
    venue: modules.get("venue") as ConsistencyInput["venue"],
    production: modules.get("production") as ConsistencyInput["production"],
    textForMusicCheck: text,
    quote: computed
      ? {
          clientTotalCents: computed.totals.clientTotalCents,
          totalExVatCents: computed.totals.clientTotalCents - computed.totals.standardVatCents,
          aiEstimateShareBp: computed.totals.aiEstimateShareBp,
          lineComponentIds: computed.lines.map((l) => l.componentId).filter((x): x is string => !!x),
        }
      : null,
    componentsEstimateCents: components.length ? estimate : null,
  };
  return { issues: checkConsistency(input), hasData: slots.length > 0 || components.length > 0 || !!quote };
}
