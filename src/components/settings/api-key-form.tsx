"use client";

import { useActionState } from "react";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { apiKeyAction, type KeyState } from "@/server/settings";

const idle: KeyState = { status: "idle", message: "" };

export function ApiKeyForm({ present, masked }: { present: boolean; masked: string }) {
  const [state, action, pending] = useActionState(apiKeyAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label={present ? `Chiave attuale: ${masked}. Incollane una nuova per sostituirla` : "Incolla qui la chiave (API key)"}
        hint="Resta solo su questo Mac, nel file .env.local. Vale subito, senza riavviare."
      >
        <Input name="apiKey" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" className="font-mono text-[13px]" />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button name="intent" value="save" disabled={pending}>
          Salva e verifica
        </Button>
        {present && (
          <Button name="intent" value="verify" variant="secondary" disabled={pending}>
            Verifica quella salvata
          </Button>
        )}
        {pending && (
          <span className="flex items-center gap-2 text-[13px] text-n500">
            <LoaderCircle size={14} className="animate-spin" /> Sto provando la chiave…
          </span>
        )}
      </div>
      {!pending && state.message && (
        <p role="status" className={cn("flex items-start gap-2 text-[13px]", state.status === "ok" ? "text-ok" : "text-warn")}>
          {state.status === "ok" ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" />}
          <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}
