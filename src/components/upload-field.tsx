"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";

type Item = { key: string; name: string; type: string; status: "uploading" | "done" | "error"; pathname?: string; error?: string };

const ACCEPT = ".pdf,.docx,.txt,.eml,application/pdf";

/**
 * Campo per i documenti del brief. Sul Mac è un normale campo file del form; online i file
 * vanno subito nell'archivio privato (Vercel Blob) e il form invia solo i loro percorsi.
 */
export function UploadField({ online, className }: { online: boolean; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const uploading = items.some((i) => i.status === "uploading");

  // finché un file sta salendo, il form non si invia (si perderebbe)
  useEffect(() => {
    const form = ref.current?.form;
    if (!form || !online) return;
    const block = (e: SubmitEvent) => {
      if (!uploading) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      alert("Attendi la fine del caricamento dei file, poi invia di nuovo.");
    };
    form.addEventListener("submit", block, { capture: true });
    return () => form.removeEventListener("submit", block, { capture: true });
  }, [online, uploading]);

  if (!online) {
    return <input ref={ref} type="file" name="files" multiple accept={ACCEPT} className={className} />;
  }

  const send = async (file: File) => {
    const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`;
    setItems((prev) => [...prev, { key, name: file.name, type: file.type, status: "uploading" }]);
    try {
      const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-80) || "documento";
      const blob = await upload(`uploads/${safe}`, file, {
        access: "private",
        handleUploadUrl: "/api/uploads",
        multipart: file.size > 8 * 1024 * 1024,
      });
      setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: "done", pathname: blob.pathname } : i)));
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: "error", error: err instanceof Error ? err.message : String(err) } : i)));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        className={className}
        onChange={(e) => {
          for (const file of Array.from(e.target.files ?? [])) void send(file);
          e.target.value = "";
        }}
      />
      {items.map((i) => (
        <div key={i.key} className="flex items-center gap-2 text-[12px]">
          {i.status === "uploading" && <LoaderCircle size={13} className="animate-spin text-violet" />}
          {i.status === "done" && <CircleCheck size={13} className="text-ok" />}
          {i.status === "error" && <TriangleAlert size={13} className="text-warn" />}
          <span className="truncate">{i.name}</span>
          {i.status === "uploading" && <span className="text-n500">caricamento…</span>}
          {i.status === "error" && <span className="text-warn">{i.error}</span>}
          {i.status === "done" && i.pathname && (
            <input type="hidden" name="uploaded" value={JSON.stringify({ pathname: i.pathname, name: i.name, type: i.type })} />
          )}
        </div>
      ))}
    </div>
  );
}
