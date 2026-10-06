"use client";

import { useActionState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { createUserAction, type UserActionState } from "@/server/users";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { TempPassword } from "./temp-password";

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserActionState, FormData>(createUserAction, {});
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end">
        <Field label="Nome e cognome">
          <Input name="name" required autoComplete="off" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Ruolo">
          <Select name="role" defaultValue="member">
            <option value="member">Membro del team</option>
            <option value="admin">Amministratore</option>
          </Select>
        </Field>
        <Button disabled={pending}>
          {pending && <LoaderCircle size={14} className="animate-spin" />}
          Crea accesso
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="flex items-start gap-2 text-[13px] text-warn">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}
      {state.password && <TempPassword email={state.email} password={state.password} ok={state.ok} />}
    </div>
  );
}
