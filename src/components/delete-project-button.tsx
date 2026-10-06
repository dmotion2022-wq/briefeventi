"use client";

import { useTransition } from "react";
import { Trash } from "lucide-react";
import { deleteProjectAction } from "@/server/projects";

export function DeleteProjectButton({ projectId, title }: { projectId: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Elimina il progetto"
      className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-[13px] text-n500 hover:bg-warn-soft hover:text-warn"
      onClick={() => {
        if (!confirm(`Eliminare "${title}" con brief, concept, preventivi e collegamenti ai fornitori? Non si può annullare.`)) return;
        start(() => deleteProjectAction(projectId));
      }}
    >
      <Trash size={14} /> {pending ? "Eliminazione…" : "Elimina"}
    </button>
  );
}
