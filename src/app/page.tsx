import Link from "next/link";
import { count, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { Plus } from "lucide-react";
import { hasApiKey } from "@/ai/qwen";
import { getDb, schema } from "@/db/client";
import { listProjects } from "@/db/queries/projects";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PROJECT_STATUS, SECTOR_LABELS, formatDate } from "@/lib/labels";
import { formatCents } from "@/lib/money";

function archiveStats() {
  const db = getDb();
  const n = (t: SQLiteTable) => db.select({ n: count() }).from(t).get()?.n ?? 0;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const cost =
    db
      .select({ c: sql<number>`coalesce(sum(${schema.aiCalls.costMicros}), 0)` })
      .from(schema.aiCalls)
      .where(sql`${schema.aiCalls.createdAt} >= ${monthStart.toISOString()}`)
      .get()?.c ?? 0;
  return {
    suppliers: n(schema.suppliers),
    venues: n(schema.venues),
    works: n(schema.referenceWorks),
    benchmarks: n(schema.priceBenchmarks),
    aiCostMonthCents: Math.round(cost / 10_000),
  };
}

export default function HomePage() {
  const projects = listProjects();
  const stats = archiveStats();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Impostazione evento"
        title="Progetti"
        description="Dal brief del cliente alla proposta, al preventivo e ai fornitori da chiamare."
        actions={
          <ButtonLink href="/projects/new">
            <Plus size={16} /> Nuovo progetto
          </ButtonLink>
        }
      />

      {!hasApiKey() && (
        <Link
          href="/settings"
          className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-amber/50 bg-amber-soft px-5 py-3.5 text-[13px] hover:border-amber"
        >
          <span>
            <strong className="font-semibold">Manca la chiave Qwen.</strong> Finché non c&apos;è, le funzioni AI (analisi del brief, concept,
            moduli, immagini) restano spente; archivio, preventivo ed export funzionano già.
          </span>
          <span className="shrink-0 font-medium text-violet">Incollala in Impostazioni →</span>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Fornitori", value: stats.suppliers, href: "/library/suppliers" },
          { label: "Location e hotel", value: stats.venues, href: "/library/venues" },
          { label: "Proposte passate", value: stats.works, href: "/library/works" },
          { label: "Voci di listino", value: stats.benchmarks, href: "/library/benchmarks" },
          { label: "Costo AI del mese", value: formatCents(stats.aiCostMonthCents), href: "/runs" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm hover:border-line-2">
            <div className="eyebrow">{s.label}</div>
            <div className="mt-1 font-display text-2xl font-bold tracking-tight">{s.value}</div>
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="Nessun progetto ancora"
          action={
            <ButtonLink href="/projects/new">
              <Plus size={16} /> Crea il primo progetto
            </ButtonLink>
          }
        >
          Incolla il brief del cliente o carica il PDF della gara: l&apos;analisi parte da lì.
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line">
              <tr className="eyebrow">
                <th className="px-5 py-3 font-normal">Progetto</th>
                <th className="px-3 py-3 font-normal">Cliente</th>
                <th className="px-3 py-3 font-normal">Date</th>
                <th className="px-3 py-3 font-normal">Pax</th>
                <th className="px-3 py-3 font-normal">Budget</th>
                <th className="px-5 py-3 font-normal">Stato</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const status = PROJECT_STATUS[p.status];
                return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-paper/70">
                    <td className="px-5 py-3">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-violet">
                        {p.title}
                      </Link>
                      <div className="font-mono text-[11px] text-n500">
                        {p.code}
                        {p.isTender && " · gara"}
                        {p.eventType && ` · ${p.eventType}`}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {p.clientName}
                      <div className="text-[11px] text-n500">{SECTOR_LABELS[p.sector]}</div>
                    </td>
                    <td className="px-3 py-3 tabular">
                      {p.startDate ? formatDate(p.startDate) : <span className="text-n400">da definire</span>}
                    </td>
                    <td className="px-3 py-3 tabular">{p.paxTarget ?? <span className="text-n400">—</span>}</td>
                    <td className="px-3 py-3 tabular">{formatCents(p.budgetCents, { noCents: true })}</td>
                    <td className="px-5 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
