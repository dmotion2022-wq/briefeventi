"use client";

import { useActionState } from "react";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { driveSourceAction, type DriveState } from "@/server/settings";

const idle: DriveState = { status: "idle", message: "" };

export function DriveSourceForm({ folderUrl, localPath, showLocalPath }: { folderUrl: string; localPath: string; showLocalPath: boolean }) {
  const [state, action, pending] = useActionState(driveSourceAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label="Link della cartella MVP SUPPLIERS"
        hint="In Google Drive: tasto destro sulla cartella → Condividi → Copia link. Deve essere condivisa con chiunque abbia il link: foglio e sottocartelle si trovano da soli."
      >
        <Input name="folderUrl" defaultValue={folderUrl} placeholder="https://drive.google.com/drive/folders/…" className="font-mono text-[13px]" />
      </Field>
      {showLocalPath && (
        <Field
          label="Cartella sincronizzata sul Mac (facoltativa)"
          hint="Se la imposti, i PDF si leggono da qui invece che dal link pubblico. Es. ~/Library/CloudStorage/GoogleDrive-…/Il mio Drive/MVP SUPPLIERS"
        >
          <Input name="driveLocalPath" defaultValue={localPath} />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={pending}>
          Collega la cartella
        </Button>
        {pending && (
          <span className="flex items-center gap-2 text-[13px] text-n500">
            <LoaderCircle size={14} className="animate-spin" /> Leggo la cartella…
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
