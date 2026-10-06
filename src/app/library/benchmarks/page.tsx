import Link from "next/link";
import { listBenchmarks } from "@/db/queries/library";
import { reviewBenchmarkAction } from "@/server/library";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DocLink } from "@/components/doc-link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { PRICING_MODEL_LABELS } from "@/lib/labels";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Listino" };

const VAT = { yes: "IVA inclusa", no: "IVA esclusa", unknown: "IVA da verificare" } as const;

export default function BenchmarksPage() {
  const all = listBenchmarks();
  const rows = all.filter((b) => b.reviewStatus === "approved");
  const pending = all.filter((b) => b.reviewStatus === "pending");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Archivio"
        title="Listino dai preventivi reali"
        description="Costi osservati nei preventivi dei fornitori. Le stime del preventivo partono da qui; ogni prezzo confermato da un fornitore si aggiunge al listino."
      />
      {pending.length > 0 && (
        <Card className="mb-5 border-amber/60">
          <div className="border-b border-line px-5 py-3 text-[13px]">
            <b>{pending.length} voci lette dai PDF da rivedere.</b> Entrano nelle stime solo dopo l&apos;approvazione.
          </div>
          <Table>
            <tbody>
              {pending.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <div className="font-medium">{b.useCase}</div>
                    <div className="text-[12px] text-n500">
                      {b.supplierName} · {b.category}
                    </div>
                    {b.included && <div className="font-mono text-[11px] text-n500">“{b.included}”</div>}
                    {b.documentId && <DocLink id={b.documentId} name="PDF" page={b.page} />}
                  </Td>
                  <Td className="tabular text-right">{formatCents(b.unitCostCents)}</Td>
                  <Td className="tabular text-right">{formatCents(b.totalCents)}</Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex gap-1">
                      <form action={reviewBenchmarkAction.bind(null, b.id, "approved")}>
                        <SubmitButton variant="secondary" size="sm">
                          Approva
                        </SubmitButton>
                      </form>
                      <form action={reviewBenchmarkAction.bind(null, b.id, "rejected")}>
                        <SubmitButton variant="ghost" size="sm">
                          Scarta
                        </SubmitButton>
                      </form>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card>
        <Table>
          <THead>
            <tr>
              <Th>Voce</Th>
              <Th>Fornitore</Th>
              <Th>Modello</Th>
              <Th className="text-right">Unitario</Th>
              <Th className="text-right">Forfait</Th>
              <Th className="text-right">Totale</Th>
              <Th>IVA</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <div className="font-medium">{b.category}</div>
                  <div className="text-[12px] text-n500">
                    {[b.useCase, b.city, b.paxRef ? `${b.paxRef} pax` : null, b.observedAt].filter(Boolean).join(" · ")}
                  </div>
                  {b.included && <div className="text-[12px]">Incluso: {b.included}</div>}
                  {b.excluded && <div className="text-[12px] text-n500">Note: {b.excluded}</div>}
                  {b.documentId && <DocLink id={b.documentId} name="Preventivo" />}
                </Td>
                <Td>
                  {b.supplierId ? (
                    <Link href={`/library/suppliers/${b.supplierId}`} className="hover:text-violet">
                      {b.supplierName}
                    </Link>
                  ) : (
                    <span className="text-n500">{b.supplierName ?? "nel PDF"}</span>
                  )}
                </Td>
                <Td>
                  {PRICING_MODEL_LABELS[b.pricingModel]}
                  {b.unit && <div className="text-[12px] text-n500">per {b.unit}</div>}
                  {b.includedQuantity && <div className="text-[12px] text-n500">fino a {b.includedQuantity}</div>}
                </Td>
                <Td className="tabular text-right">{formatCents(b.unitCostCents)}</Td>
                <Td className="tabular text-right">{formatCents(b.fixedCostCents)}</Td>
                <Td className="tabular text-right font-medium">{formatCents(b.totalCents)}</Td>
                <Td>
                  <Badge tone={b.vatIncluded === "unknown" ? "amber" : "neutral"}>{VAT[b.vatIncluded]}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
