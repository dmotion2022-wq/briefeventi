import { FileText } from "lucide-react";

export function DocLink({ id, name, page }: { id: string; name?: string; page?: number | null }) {
  return (
    <a
      href={`/api/documents/${id}${page ? `#page=${page}` : ""}`}
      target="_blank"
      className="inline-flex items-center gap-1 text-[12px] text-violet hover:underline"
      title={name}
    >
      <FileText size={12} /> {name ? (name.length > 38 ? `${name.slice(0, 36)}…` : name) : "PDF"}
      {page ? `, pag. ${page}` : ""}
    </a>
  );
}
