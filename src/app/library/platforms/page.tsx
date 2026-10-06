import { ExternalLink, Mail, Phone } from "lucide-react";
import { requireUser } from "@/auth/session";
import { schema } from "@/db/client";
import { PLATFORMS_VERIFIED_AT } from "@/db/platforms-seed";
import { listPlatforms, platformCounts, type PlatformRow } from "@/db/queries/platforms";
import { createPlatformAction, deletePlatformAction, setPlatformStatusAction, updatePlatformAction } from "@/server/platforms";
import { PlatformSearch } from "@/components/platforms/platform-search";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/submit-button";
import { PLATFORM_CATEGORY_LABELS, PLATFORM_STATUS, PLATFORM_TYPE_LABELS, formatDate } from "@/lib/labels";
import { cn } from "@/lib/cn";

export const metadata = { title: "Piattaforme" };

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

function Source({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} {...external} className="text-[11px] text-n400 hover:text-violet hover:underline">
      fonte
    </a>
  );
}

function PlatformCard({ p }: { p: PlatformRow }) {
  const status = PLATFORM_STATUS[p.status];
  return (
    <Card className={cn(p.status === "scartata" && "opacity-60")}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <a href={p.url} {...external} className="inline-flex items-center gap-1 text-[15px] font-semibold hover:text-violet">
                {p.name} <ExternalLink size={12} className="text-n400" />
              </a>
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone="violet">{PLATFORM_TYPE_LABELS[p.type] ?? p.type}</Badge>
            </div>
            <div className="mt-0.5 text-[12px] text-n500">
              {[p.domain, p.coverage, p.organizerCost].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {p.status !== "in_uso" && (
              <form action={setPlatformStatusAction.bind(null, p.id, "in_uso")}>
                <SubmitButton size="sm">La usiamo</SubmitButton>
              </form>
            )}
            {p.status !== "da_valutare" && (
              <form action={setPlatformStatusAction.bind(null, p.id, "da_valutare")}>
                <SubmitButton size="sm" variant="secondary">
                  Da valutare
                </SubmitButton>
              </form>
            )}
            {p.status !== "scartata" && (
              <form action={setPlatformStatusAction.bind(null, p.id, "scartata")}>
                <SubmitButton size="sm" variant="ghost">
                  Scarta
                </SubmitButton>
              </form>
            )}
          </div>
        </div>

        {p.description && <p className="text-[13px] leading-relaxed text-n700">{p.description}</p>}
        {p.howToUse && (
          <p className="text-[13px] leading-relaxed">
            <span className="font-medium">Come si usa: </span>
            {p.howToUse}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
          {p.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail size={13} className="text-n400" />
              <a href={`mailto:${p.email}`} className="hover:text-violet hover:underline">
                {p.email}
              </a>
              <Source href={p.emailSource} />
            </span>
          )}
          {p.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone size={13} className="text-n400" />
              <a href={`tel:${p.phone}`} className="font-mono hover:text-violet hover:underline">
                {p.phoneDisplay ?? p.phone}
              </a>
              <Source href={p.phoneSource} />
            </span>
          )}
          {p.contactPage && (
            <a href={p.contactPage} {...external} className="text-violet hover:underline">
              Pagina contatti
            </a>
          )}
          {!p.email && !p.phone && !p.contactPage && <span className="text-n400">Nessun contatto pubblico: si usa dal sito.</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {p.categories.map((c) => (
            <a key={c} href={`?categoria=${c}`} className="rounded-xs bg-n100 px-1.5 py-0.5 text-[11px] text-n700 hover:bg-violet-soft hover:text-violet">
              {PLATFORM_CATEGORY_LABELS[c] ?? c}
            </a>
          ))}
        </div>

        {p.searchUrl && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-[12px] text-n500">Cerca direttamente su {p.name.split(" ")[0]}:</span>
            <PlatformSearch template={p.searchUrl} compact />
          </div>
        )}

        {p.notes && <p className="text-[12px] leading-relaxed text-n500">{p.notes}</p>}

        <details className="border-t border-line pt-2 text-[13px]">
          <summary className="cursor-pointer text-n500 hover:text-ink">Modifica note e contatti</summary>
          <form action={updatePlatformAction.bind(null, p.id)} className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Email">
              <Input name="email" defaultValue={p.email ?? ""} />
            </Field>
            <Field label="Telefono">
              <Input name="phone" defaultValue={p.phoneDisplay ?? p.phone ?? ""} />
            </Field>
            <Field label="Pagina contatti">
              <Input name="contactPage" defaultValue={p.contactPage ?? ""} />
            </Field>
            <Field label="Copertura">
              <Input name="coverage" defaultValue={p.coverage ?? ""} />
            </Field>
            <Field label="Costo per chi organizza">
              <Input name="organizerCost" defaultValue={p.organizerCost ?? ""} />
            </Field>
            <Field label="Link di ricerca" hint="Con {q} per il testo e {city} per la città">
              <Input name="searchUrl" defaultValue={p.searchUrl ?? ""} className="font-mono text-[12px]" />
            </Field>
            <Field label="Note del team" className="md:col-span-2">
              <Textarea name="notes" defaultValue={p.notes ?? ""} className="min-h-16" />
            </Field>
            <div className="flex items-center justify-between md:col-span-2">
              <SubmitButton size="sm" variant="secondary">
                Salva
              </SubmitButton>
              {!p.seedKey && (
                <button formAction={deletePlatformAction.bind(null, p.id)} className="text-[12px] text-n500 hover:text-warn">
                  Elimina la piattaforma
                </button>
              )}
            </div>
          </form>
        </details>
      </CardBody>
    </Card>
  );
}

export default async function PlatformsPage(props: PageProps<"/library/platforms">) {
  await requireUser();
  const sp = await props.searchParams;
  const category = typeof sp.categoria === "string" && sp.categoria in PLATFORM_CATEGORY_LABELS ? sp.categoria : "";
  const status = typeof sp.stato === "string" && sp.stato in PLATFORM_STATUS ? sp.stato : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const [rows, counts] = await Promise.all([listPlatforms({ category, status, q }), platformCounts()]);
  const visible = status ? rows : rows.filter((p) => p.status !== "scartata");
  const hidden = rows.length - visible.length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Archivio"
        title="Piattaforme"
        description="Dove cercare fornitori nuovi, categoria per categoria: marketplace, elenchi, associazioni, convention bureau e portali ufficiali, con i loro contatti. Quelle segnate “in uso” compaiono nei fornitori di ogni progetto."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone="ok">In uso: {counts.byStatus.in_uso}</Badge>
        <Badge>Da valutare: {counts.byStatus.da_valutare}</Badge>
        <Badge tone="warn">Scartate: {counts.byStatus.scartata}</Badge>
        <span className="text-n500">· contatti verificati sui siti ufficiali il {formatDate(PLATFORMS_VERIFIED_AT)}</span>
      </div>

      <form className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Categoria" className="w-72">
          <Select name="categoria" defaultValue={category}>
            <option value="">Tutte</option>
            {Object.entries(PLATFORM_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({counts.byCategory[k] ?? 0})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stato" className="w-52">
          <Select name="stato" defaultValue={status}>
            <option value="">In uso e da valutare</option>
            {Object.entries(PLATFORM_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cerca" className="min-w-48 flex-1">
          <Input name="q" defaultValue={q} placeholder="nome, città, servizio…" />
        </Field>
        <SubmitButton variant="secondary">Filtra</SubmitButton>
      </form>

      <details className="mb-5 rounded-md border border-line bg-card px-5 py-3">
        <summary className="cursor-pointer text-[13px] font-medium">Aggiungi una piattaforma che usate</summary>
        <form action={createPlatformAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Nome">
            <Input name="name" required />
          </Field>
          <Field label="Sito">
            <Input name="url" required placeholder="https://…" />
          </Field>
          <Field label="Tipo">
            <Select name="type" defaultValue="marketplace">
              {schema.PLATFORM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PLATFORM_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Copertura">
            <Input name="coverage" placeholder="Italia, Lombardia…" />
          </Field>
          <Field label="Email">
            <Input name="email" />
          </Field>
          <Field label="Telefono">
            <Input name="phone" />
          </Field>
          <Field label="A cosa serve" className="md:col-span-2">
            <Textarea name="description" className="min-h-16" />
          </Field>
          <fieldset className="md:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-n700">Categorie</legend>
            <div className="grid gap-1 text-[13px] md:grid-cols-3">
              {Object.entries(PLATFORM_CATEGORY_LABELS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" name="categories" value={k} /> {v}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-2">
            <SubmitButton>Aggiungi</SubmitButton>
          </div>
        </form>
      </details>

      {visible.length === 0 ? (
        <EmptyState title="Nessuna piattaforma">Cambia i filtri o aggiungine una.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((p) => (
            <PlatformCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {hidden > 0 && <p className="mt-4 text-[13px] text-n500">{hidden} piattaforme scartate nascoste: scegli “Scartata” nello stato per vederle.</p>}
    </div>
  );
}
