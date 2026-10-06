"use client";

import { useActionState, useTransition } from "react";
import { deleteUserAction, resetPasswordAction, setUserActiveAction, setUserRoleAction, type UserActionState } from "@/server/users";
import { Button } from "@/components/ui/button";
import { TempPassword } from "./temp-password";

type Props = { id: string; name: string; active: boolean; role: "admin" | "member"; self: boolean };

export function UserActions({ id, name, active, role, self }: Props) {
  const [reset, resetAction, resetting] = useActionState<UserActionState>(resetPasswordAction.bind(null, id), {});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        <form action={resetAction}>
          <Button variant="ghost" size="sm" disabled={resetting}>
            Nuova password
          </Button>
        </form>
        {!self && (
          <>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setUserRoleAction(id, role === "admin" ? "member" : "admin"))}>
              {role === "admin" ? "Rendi membro" : "Rendi amministratore"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setUserActiveAction(id, !active))}>
              {active ? "Disattiva" : "Riattiva"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              className="text-warn hover:bg-warn-soft"
              onClick={() => {
                if (confirm(`Eliminare l'accesso di ${name}? I progetti restano.`)) run(() => deleteUserAction(id));
              }}
            >
              Elimina
            </Button>
          </>
        )}
      </div>
      {reset.error && <p className="text-[13px] text-warn">{reset.error}</p>}
      {reset.password && <TempPassword email={reset.email} password={reset.password} ok={reset.ok} />}
    </div>
  );
}
