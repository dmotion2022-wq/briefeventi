import { notFound } from "next/navigation";
import { count, eq, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getDb, schema } from "@/db/client";
import { getProject } from "@/db/queries/projects";
import { activeRuns } from "@/worker/runs";
import { latestBrief } from "@/ai/context";
import { updateProjectStatusAction } from "@/server/projects";
import { RunProgress } from "@/components/run-progress";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { StepNav } from "@/components/shell/step-nav";
import { Select } from "@/components/ui/field";
import { PROJECT_STATUS, SECTOR_LABELS, formatDate } from "@/lib/labels";
import { formatCents } from "@/lib/money";

const TASK_LABELS: Record<string, string> = {
  "brief.extract": "Analisi del brief",
  "gap.analyze": "Analisi delle lacune",
  "concept.generate": "Generazione dei concept",
  "concept.critique": "Valutazione dei concept",
  "bible.build": "Concept bible",
  "agenda.develop": "Scaletta",
  "modules.develop": "Sviluppo della proposta",
  "quote.generate": "Preventivo",
  "consistency.review": "Controllo di coerenza",
  "supplier.search": "Ricerca fornitori",
  "images.generate": "Immagini",
  "export.pptx": "Presentazione PowerPoint",
  "export.html": "Pagina web",
};

function completedSteps(projectId: string) {
  const db = getDb();
  const done: string[] = [];
  const brief = latestBrief(projectId);
  if (brief?.status === "confirmed") done.push("brief");
  if (brief?.analysis) done.push("gaps");
  const n = (t: SQLiteTable, where: SQL) => db.select({ n: count() }).from(t).where(where).get()?.n ?? 0;
  if (n(schema.concepts, eq(schema.concepts.projectId, projectId)) > 0) done.push("concepts");
  if (n(schema.agendaSlots, eq(schema.agendaSlots.projectId, projectId)) > 0) done.push("agenda");
  if (n(schema.modules, eq(schema.modules.projectId, projectId)) > 0) done.push("develop");
  if (n(schema.imageAssets, eq(schema.imageAssets.projectId, projectId)) > 0) done.push("images");
  if (n(schema.quotes, eq(schema.quotes.projectId, projectId)) > 0) done.push("quote");
  if (n(schema.supplierLinks, eq(schema.supplierLinks.projectId, projectId)) > 0) done.push("suppliers");
  if (n(schema.exportsTable, eq(schema.exportsTable.projectId, projectId)) > 0) done.push("exports");
  return done;
}

export default async function ProjectLayout(props: LayoutProps<"/projects/[id]">) {
  const { id } = await props.params;
  const project = getProject(id);
  if (!project) notFound();
  const runs = activeRuns(id);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">
            {project.code} · {project.clientName} · {SECTOR_LABELS[project.sector]}
            {project.isTender && " · gara"}
            {project.confidential && " · riservato"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-n500">
            <span>{project.eventType ?? "tipo da definire"}</span>
            <span>
              {project.startDate ? formatDate(project.startDate) : "date da definire"}
              {project.endDate && project.endDate !== project.startDate ? ` → ${formatDate(project.endDate)}` : ""}
            </span>
            <span>{project.city ?? "luogo da definire"}</span>
            <span>{project.paxTarget ? `${project.paxTarget} pax` : "pax da definire"}</span>
            <span>budget {formatCents(project.budgetCents, { noCents: true })}</span>
            {project.tenderDeadline && <span className="text-magenta">scadenza gara {formatDate(project.tenderDeadline)}</span>}
          </div>
        </div>
        <form action={updateProjectStatusAction.bind(null, id)} className="flex items-center gap-2">
          <Select name="status" defaultValue={project.status} className="h-8 w-40 text-[13px]">
            {Object.entries(PROJECT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <button className="h-8 rounded-sm border border-line-2 bg-card px-3 text-[13px] hover:bg-n100">Aggiorna</button>
          <DeleteProjectButton projectId={id} title={project.title} />
        </form>
      </header>
      {runs.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {runs.map((r) => (
            <RunProgress key={r.id} runId={r.id} label={TASK_LABELS[r.task] ?? r.task} />
          ))}
        </div>
      )}
      <StepNav projectId={id} done={completedSteps(id)} />
      {props.children}
    </div>
  );
}
