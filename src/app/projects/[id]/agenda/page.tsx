import { hasApiKey } from "@/ai/qwen";
import { agendaSlotsOf, latestBible } from "@/ai/context";
import { schema } from "@/db/client";
import { deleteSlotAction, developAgendaAction, saveSlotAction } from "@/server/development";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/labels";
import { requireUser } from "@/auth/session";

const KIND: Record<string, { label: string; tone: Tone }> = {
  registration: { label: "Accoglienza", tone: "neutral" },
  plenary: { label: "Plenaria", tone: "violet" },
  breakout: { label: "Breakout", tone: "violet" },
  coffee: { label: "Coffee break", tone: "amber" },
  lunch: { label: "Pranzo", tone: "amber" },
  dinner: { label: "Cena", tone: "amber" },
  gala: { label: "Gala", tone: "magenta" },
  transfer: { label: "Transfer", tone: "neutral" },
  activity: { label: "Attività", tone: "magenta" },
  networking: { label: "Networking", tone: "ok" },
  free: { label: "Tempo libero", tone: "neutral" },
  other: { label: "Altro", tone: "neutral" },
};

function SlotForm({ projectId, slot }: { projectId: string; slot?: typeof schema.agendaSlots.$inferSelect }) {
  return (
    <form action={saveSlotAction.bind(null, projectId, slot?.id ?? null)} className="grid grid-cols-[56px_76px_76px_130px_1fr_120px_70px_auto] items-center gap-1.5">
      <Input name="day" type="number" min={1} defaultValue={slot?.day ?? 1} className="h-8 px-2" title="Giorno" />
      <Input name="startTime" defaultValue={slot?.startTime ?? "09:00"} className="h-8 px-2" />
      <Input name="endTime" defaultValue={slot?.endTime ?? "10:00"} className="h-8 px-2" />
      <Select name="kind" defaultValue={slot?.kind ?? "plenary"} className="h-8 px-2 text-[13px]">
        {schema.SLOT_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND[k].label}
          </option>
        ))}
      </Select>
      <Input name="title" defaultValue={slot?.title ?? ""} placeholder="Titolo" required className="h-8 px-2" />
      <Input name="room" defaultValue={slot?.room ?? ""} placeholder="Sala" className="h-8 px-2" />
      <Input name="pax" type="number" defaultValue={slot?.pax ?? ""} placeholder="pax" className="h-8 px-2" />
      <SubmitButton variant="secondary" size="sm">
        {slot ? "Salva" : "Aggiungi"}
      </SubmitButton>
    </form>
  );
}

export default async function AgendaPage(props: PageProps<"/projects/[id]/agenda">) {
  await requireUser();
  const { id } = await props.params;
  const [slots, bible] = await Promise.all([agendaSlotsOf(id), latestBible(id)]);
  const aiReady = hasApiKey();
  const days = [...new Set(slots.map((s) => s.day))].sort((a, b) => a - b);

  const generate = (
    <form action={developAgendaAction.bind(null, id)} className="flex flex-col gap-2">
      <Textarea name="instructions" placeholder="Indicazioni facoltative (es. arrivi entro le 11, cena alle 20:30, niente sessioni dopo le 18)" className="min-h-14" />
      <div className="flex justify-end">
        <SubmitButton variant={slots.length ? "secondary" : "primary"}>{slots.length ? "Rigenera la scaletta" : "Scrivi la scaletta"}</SubmitButton>
      </div>
    </form>
  );

  if (!slots.length) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState title="La spina dorsale dell'evento">
          {bible
            ? "La scaletta segue l'arco narrativo della concept bible; ogni modulo (location, catering, interazione…) si aggancerà ai suoi slot."
            : "Prima scegli un concept e crea la concept bible. Oppure scrivi la scaletta a mano qui sotto."}
        </EmptyState>
        {bible && aiReady && <div className="mt-4">{generate}</div>}
        <Card className="mt-4">
          <CardHeader title="Aggiungi uno slot a mano" />
          <CardBody>
            <SlotForm projectId={id} />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => {
        const daySlots = slots.filter((s) => s.day === day);
        const date = daySlots.find((s) => s.date)?.date;
        return (
          <Card key={day}>
            <CardHeader eyebrow={`Giorno ${day}`} title={date ? formatDate(date) : "Data da definire"} />
            <div className="divide-y divide-line">
              {daySlots.map((s) => (
                <details key={s.id} className="group">
                  <summary className="flex cursor-pointer items-start gap-4 px-5 py-3 hover:bg-paper/60">
                    <span className="w-24 shrink-0 font-mono text-[13px]">
                      {s.startTime}–{s.endTime}
                    </span>
                    <Badge tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.title}</div>
                      {s.description && <div className="text-[13px] text-n500">{s.description}</div>}
                      {s.narrativeBeat && <div className="mt-0.5 text-[12px] text-violet">↳ {s.narrativeBeat}</div>}
                    </div>
                    <span className="shrink-0 text-[12px] text-n500">
                      {[s.room, s.pax ? `${s.pax} pax` : null].filter(Boolean).join(" · ")}
                    </span>
                  </summary>
                  <div className="flex items-center gap-2 bg-paper/60 px-5 pb-3">
                    <SlotForm projectId={id} slot={s} />
                    <form action={deleteSlotAction.bind(null, id, s.id)}>
                      <SubmitButton variant="ghost" size="sm">
                        Elimina
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          </Card>
        );
      })}
      <Card>
        <CardHeader title="Aggiungi uno slot" />
        <CardBody>
          <SlotForm projectId={id} />
        </CardBody>
      </Card>
      {aiReady && bible && (
        <Card>
          <CardHeader title="Rigenera con indicazioni" description="Gli slot che restano mantengono il loro ID: moduli e voci di costo restano agganciati." />
          <CardBody>{generate}</CardBody>
        </Card>
      )}
    </div>
  );
}
