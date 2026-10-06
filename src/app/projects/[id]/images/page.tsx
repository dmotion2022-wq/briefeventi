import { desc, eq } from "drizzle-orm";
import { hasApiKey } from "@/ai/qwen";
import { latestBible } from "@/ai/context";
import { getDb, schema } from "@/db/client";
import { deleteImageAction, generateImagesAction, generateOneImageAction, selectKeyVisualAction } from "@/server/images";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";
import { requireUser } from "@/auth/session";

const PURPOSE = { key_visual: "Key visual", moodboard: "Moodboard", application: "Declinazione" } as const;

export default async function ImagesPage(props: PageProps<"/projects/[id]/images">) {
  await requireUser();
  const { id } = await props.params;
  const aiReady = hasApiKey();
  const bible = await latestBible(id);
  const images = await getDb().select().from(schema.imageAssets).where(eq(schema.imageAssets.projectId, id)).orderBy(desc(schema.imageAssets.createdAt)).all();

  if (!bible && !images.length) {
    return <EmptyState title="Prima la concept bible">Key visual e moodboard partono dall&apos;art direction e dalla palette della bible.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-n500">
          Immagini generate con Qwen-Image partendo dai prompt della concept bible, con palette e tono applicati a tutte. Il key
          visual scelto va in copertina della presentazione e della pagina web.
        </p>
        {aiReady && bible && (
          <form action={generateImagesAction.bind(null, id)}>
            <SubmitButton>{images.length ? "Genera un'altra serie" : "Genera key visual e moodboard"}</SubmitButton>
          </form>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {images.map((img) => (
            <Card key={img.id} className={cn("overflow-hidden", img.selected && "ring-2 ring-violet")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/images/${img.id}`} alt={img.prompt.slice(0, 120)} className="aspect-video w-full bg-n100 object-cover" />
              <CardBody className="flex flex-col gap-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <Badge tone={img.purpose === "key_visual" ? "magenta" : "neutral"}>{PURPOSE[img.purpose]}</Badge>
                  {img.selected && <Badge tone="dark">in copertina</Badge>}
                  <span className="ml-auto font-mono text-n500">{img.size.replace("*", "×")}</span>
                </div>
                <p className="line-clamp-3 text-n700" title={img.prompt}>
                  {img.prompt}
                </p>
                <div className="flex gap-2">
                  {!img.selected && (
                    <form action={selectKeyVisualAction.bind(null, id, img.id)}>
                      <SubmitButton variant="secondary" size="sm">
                        Usa in copertina
                      </SubmitButton>
                    </form>
                  )}
                  <a href={`/api/images/${img.id}`} download className="inline-flex h-8 items-center rounded-sm px-3 text-[13px] hover:bg-n100">
                    Scarica
                  </a>
                  <form action={deleteImageAction.bind(null, id, img.id)} className="ml-auto">
                    <SubmitButton variant="ghost" size="sm">
                      Elimina
                    </SubmitButton>
                  </form>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {aiReady && (
        <Card>
          <CardHeader title="Immagine su misura" description="Scrivi o modifica un prompt: palette e tono della bible vengono aggiunti in automatico." />
          <CardBody>
            <form action={generateOneImageAction.bind(null, id)} className="flex flex-col gap-2">
              <Textarea name="prompt" required defaultValue={bible ? (bible.data as { keyVisual?: { imagePrompt?: string } }).keyVisual?.imagePrompt : ""} className="min-h-20" />
              <div className="flex items-center justify-end gap-2">
                <Select name="purpose" defaultValue="key_visual" className="h-8 w-40 text-[13px]">
                  <option value="key_visual">Key visual</option>
                  <option value="moodboard">Moodboard</option>
                  <option value="application">Declinazione</option>
                </Select>
                <Select name="size" defaultValue="1664*928" className="h-8 w-40 text-[13px]">
                  <option value="1664*928">16:9 orizzontale</option>
                  <option value="1328*1328">quadrata</option>
                  <option value="928*1664">9:16 verticale</option>
                </Select>
                <SubmitButton variant="secondary">Genera</SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
