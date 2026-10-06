"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createSupplier } from "@/server/suppliers";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { SUPPLIER_KIND_LABELS } from "@/lib/labels";

export function NewSupplierForm() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} /> Nuovo fornitore
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      action={async (form) => {
        const id = await createSupplier(form);
        router.push(`/library/suppliers/${id}`);
      }}
    >
      <Input name="name" placeholder="Nome" required className="w-48" autoFocus />
      <Select name="kind" defaultValue="other" className="w-44">
        {Object.entries(SUPPLIER_KIND_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      <Input name="city" placeholder="Città" className="w-32" />
      <Button>Crea</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Annulla
      </Button>
    </form>
  );
}
