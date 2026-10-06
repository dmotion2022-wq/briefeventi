"use client";

import { useActionState } from "react";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { changePasswordAction, type FormState } from "@/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/auth/password-rules";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Password attuale (o quella temporanea ricevuta)">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nuova password" hint={`Almeno ${MIN_PASSWORD_LENGTH} caratteri. Una frase di più parole è facile da ricordare e difficile da indovinare.`}>
        <Input name="next" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>
      <Field label="Ripeti la nuova password">
        <Input name="repeat" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>
      {state.error && (
        <p role="alert" className="flex items-start gap-2 text-[13px] text-warn">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}
      {state.ok && (
        <p role="status" className="flex items-start gap-2 text-[13px] text-ok">
          <CircleCheck size={16} className="mt-0.5 shrink-0" />
          <span>{state.ok}</span>
        </p>
      )}
      <div>
        <Button disabled={pending}>
          {pending && <LoaderCircle size={14} className="animate-spin" />}
          Cambia password
        </Button>
      </div>
    </form>
  );
}
