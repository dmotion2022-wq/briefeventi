import Link from "next/link";
import { Phone, Search } from "lucide-react";
import { listSuppliers } from "@/db/queries/library";
import { schema } from "@/db/client";
import { formatPhoneDisplay } from "@/domain/contacts/phone";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SUPPLIER_KIND_LABELS } from "@/lib/labels";
import { NewSupplierForm } from "./new-supplier-form";

export const metadata = { title: "Fornitori" };

export default async function SuppliersPage(props: PageProps<"/library/suppliers">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const rows = listSuppliers({ q, kind });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Archivio"
        title="Fornitori e partner"
        description="Rubrica dei contatti da chiamare. Ogni telefono mostra da dove viene: PDF, sito o conferma a voce."
        actions={<NewSupplierForm />}
      />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-n400" />
          <Input name="q" defaultValue={q} placeholder="Nome, città o regione" className="pl-9" />
        </div>
        <Select name="kind" defaultValue={kind} className="w-56">
          <option value="">Tutte le categorie</option>
          {schema.SUPPLIER_KINDS.map((k) => (
            <option key={k} value={k}>
              {SUPPLIER_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Button variant="secondary">Filtra</Button>
        <span className="ml-auto font-mono text-[11px] text-n500">{rows.length} fornitori</span>
      </form>
      <Card>
        <Table>
          <THead>
            <tr>
              <Th>Fornitore</Th>
              <Th>Categoria</Th>
              <Th>Dove</Th>
              <Th>Telefono</Th>
              <Th>Contatti</Th>
              <Th>Fonte</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map(({ supplier: s, phones, emails, firstPhone }) => (
              <Tr key={s.id}>
                <Td>
                  <Link href={`/library/suppliers/${s.id}`} className="font-medium hover:text-violet">
                    {s.name}
                  </Link>
                  {s.domain && <div className="font-mono text-[11px] text-n500">{s.domain}</div>}
                </Td>
                <Td>{SUPPLIER_KIND_LABELS[s.kind]}</Td>
                <Td>{[s.city, s.region, s.country !== "IT" ? s.country : null].filter(Boolean).join(", ") || "—"}</Td>
                <Td className="whitespace-nowrap">
                  {firstPhone ? (
                    <a href={`tel:${firstPhone}`} className="inline-flex items-center gap-1.5 text-violet hover:underline">
                      <Phone size={13} /> {formatPhoneDisplay(firstPhone)}
                    </a>
                  ) : (
                    <span className="text-n400">—</span>
                  )}
                </Td>
                <Td className="font-mono text-[12px] text-n500">
                  {phones} tel · {emails} email
                </Td>
                <Td>
                  <Badge tone={s.source === "manual" ? "violet" : s.source === "web_search" ? "magenta" : "neutral"}>
                    {{ sheet: "Drive", pdf: "PDF", web_search: "Ricerca", manual: "Manuale" }[s.source]}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
