import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { listRuns } from "@/worker/runs";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { RUN_STATUS, formatDateTime } from "@/lib/labels";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Log AI e costi" };

const eurFromMicros = (micros: number) => formatCents(Math.round(micros / 10_000));

export default function RunsPage() {
  const db = getDb();
  const runs = listRuns({ limit: 150 });
  const projects = new Map(db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).all().map((p) => [p.id, p.title]));
  const byModel = db
    .select({
      model: schema.aiCalls.model,
      calls: sql<number>`count(*)`,
      input: sql<number>`sum(${schema.aiCalls.inputTokens})`,
      output: sql<number>`sum(${schema.aiCalls.outputTokens})`,
      units: sql<number>`sum(${schema.aiCalls.units})`,
      cost: sql<number>`sum(${schema.aiCalls.costMicros})`,
    })
    .from(schema.aiCalls)
    .groupBy(schema.aiCalls.model)
    .orderBy(desc(sql`sum(${schema.aiCalls.costMicros})`))
    .all();
  const byProject = db
    .select({ projectId: schema.aiCalls.projectId, cost: sql<number>`sum(${schema.aiCalls.costMicros})`, calls: sql<number>`count(*)` })
    .from(schema.aiCalls)
    .groupBy(schema.aiCalls.projectId)
    .all();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Sistema"
        title="Log AI e costi"
        description="Ogni lavoro del worker e ogni chiamata a Qwen, con token e costo stimato dai prezzi delle Impostazioni."
      />
      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Per modello" />
          <CardBody className="text-[13px]">
            {byModel.length === 0 && <span className="text-n500">Nessuna chiamata ancora.</span>}
            {byModel.map((m) => (
              <div key={m.model} className="flex justify-between border-b border-line py-1.5 last:border-0">
                <span className="font-mono text-[12px]">{m.model}</span>
                <span className="text-n500">
                  {m.calls} chiamate · {Math.round((m.input + m.output) / 1000)}k token{m.units ? ` · ${m.units} unità` : ""}
                </span>
                <span className="tabular font-medium">{eurFromMicros(m.cost)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Per progetto" />
          <CardBody className="text-[13px]">
            {byProject.length === 0 && <span className="text-n500">Nessuna chiamata ancora.</span>}
            {byProject.map((p) => (
              <div key={p.projectId ?? "archivio"} className="flex justify-between border-b border-line py-1.5 last:border-0">
                <span>{p.projectId ? projects.get(p.projectId) ?? p.projectId : "Archivio (import e schede)"}</span>
                <span className="text-n500">{p.calls} chiamate</span>
                <span className="tabular font-medium">{eurFromMicros(p.cost)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <Th>Quando</Th>
              <Th>Lavoro</Th>
              <Th>Progetto</Th>
              <Th>Stato</Th>
              <Th>Modello</Th>
              <Th className="text-right">Token</Th>
              <Th className="text-right">Costo</Th>
            </tr>
          </THead>
          <tbody>
            {runs.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                <Td>
                  <div className="font-mono text-[12px]">{r.task}</div>
                  {r.error && <div className="max-w-md text-[12px] text-warn">{r.error}</div>}
                </Td>
                <Td>{r.projectId ? <Link href={`/projects/${r.projectId}`} className="hover:text-violet">{projects.get(r.projectId) ?? "—"}</Link> : "—"}</Td>
                <Td>
                  <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>
                </Td>
                <Td className="font-mono text-[12px]">{r.model ?? "—"}</Td>
                <Td className="tabular text-right">{r.inputTokens + r.outputTokens ? `${Math.round((r.inputTokens + r.outputTokens) / 100) / 10}k` : "—"}</Td>
                <Td className="tabular text-right">{r.costMicros ? eurFromMicros(r.costMicros) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
