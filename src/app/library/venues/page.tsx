import Link from "next/link";
import { Search } from "lucide-react";
import { listVenues } from "@/db/queries/library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocLink } from "@/components/doc-link";
import { Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Location e hotel" };

export default async function VenuesPage(props: PageProps<"/library/venues">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const venues = listVenues({ q });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Archivio"
        title="Location, hotel e DMC"
        description="Dalla cartella LOCATIONS / HOTEL del Drive. Capienze e camere vengono dall'indice; la lettura AI dei PDF aggiunge le sale per setup."
      />
      <form className="mb-4 flex items-center gap-2">
        <div className="relative w-80">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-n400" />
          <Input name="q" defaultValue={q} placeholder="Nome, città, regione o tag" className="pl-9" />
        </div>
        <Button variant="secondary">Cerca</Button>
        <span className="ml-auto font-mono text-[11px] text-n500">{venues.length} schede</span>
      </form>
      <Card>
        <Table>
          <THead>
            <tr>
              <Th>Location</Th>
              <Th>Tipo</Th>
              <Th>Dove</Th>
              <Th>Capienza</Th>
              <Th>Camere</Th>
              <Th>Adatta per</Th>
              <Th>Fit</Th>
            </tr>
          </THead>
          <tbody>
            {venues.map((v) => (
              <Tr key={v.id}>
                <Td>
                  {v.supplierId ? (
                    <Link href={`/library/suppliers/${v.supplierId}`} className="font-medium hover:text-violet">
                      {v.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{v.name}</span>
                  )}
                  {v.usp && <div className="text-[12px] text-n500">{v.usp}</div>}
                  {v.documentId && <DocLink id={v.documentId} name="Brochure" />}
                </Td>
                <Td>
                  {v.assetType}
                  {v.locationType && <div className="text-[12px] text-n500">{v.locationType}</div>}
                </Td>
                <Td>{[v.city, v.region, v.country].filter(Boolean).join(", ") || "—"}</Td>
                <Td className="tabular">{v.capacityMax ? `${v.capacityMax} pax` : <span className="text-n400">—</span>}</Td>
                <Td className="tabular">{v.rooms ?? (v.roomsText ? <span className="text-[12px]">{v.roomsText}</span> : <span className="text-n400">—</span>)}</Td>
                <Td>
                  <div className="text-[12px]">{v.bestFor ?? "—"}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(v.tags ?? []).map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  {v.fitScore ? (
                    <Badge tone={v.fitScore >= 4 ? "ok" : "neutral"} title={v.fitReason ?? undefined}>
                      {v.fitScore}/5
                    </Badge>
                  ) : (
                    "—"
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
