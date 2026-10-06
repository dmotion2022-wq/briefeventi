import Link from "next/link";
import { CircleCheck, Info, TriangleAlert, OctagonAlert } from "lucide-react";
import { consistencyFor } from "@/domain/consistency/load";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/auth/session";

const ICON = {
  error: <OctagonAlert size={16} className="mt-0.5 shrink-0 text-warn" />,
  warning: <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber" />,
  info: <Info size={16} className="mt-0.5 shrink-0 text-violet" />,
};

export default async function CheckPage(props: PageProps<"/projects/[id]/check">) {
  await requireUser();
  const { id } = await props.params;
  const result = await consistencyFor(id);
  if (!result?.hasData) {
    return <EmptyState title="Niente da controllare ancora">Il controllo lavora su scaletta, moduli e preventivo.</EmptyState>;
  }
  const { issues } = result;
  const counts = { error: issues.filter((i) => i.severity === "error").length, warning: issues.filter((i) => i.severity === "warning").length };
  return (
    <Card>
      <CardHeader
        title={issues.length ? `${counts.error} errori · ${counts.warning} avvisi` : "Tutto coerente"}
        description="Pasti e catering, slot, notti e camere, partecipanti, SIAE, compliance di settore, budget e costi ancora stimati."
      />
      <div className="divide-y divide-line">
        {issues.length === 0 && (
          <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-ok">
            <CircleCheck size={16} /> Nessun problema trovato dalle regole.
          </div>
        )}
        {issues.map((i) => (
          <div key={i.id} className="flex items-start gap-3 px-5 py-3 text-[13px]">
            {ICON[i.severity]}
            <div className="min-w-0 flex-1">
              <span className="eyebrow mr-2">{i.area}</span>
              {i.message}
            </div>
            <Link href={i.link} className="shrink-0 text-violet hover:underline">
              Vai a correggere →
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
