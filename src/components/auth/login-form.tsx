"use client";

import { useActionState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { loginAction, type FormState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && (
        <p role="alert" className="flex items-start gap-2 text-[13px] text-warn">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}
      <Button disabled={pending}>
        {pending && <LoaderCircle size={14} className="animate-spin" />}
        Entra
      </Button>
    </form>
  );
}
