"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { platformSearchLink } from "@/lib/labels";

/** Ricerca diretta sulla piattaforma (si apre in una nuova scheda), con testo e città modificabili. */
export function PlatformSearch({ template, q = "", city = "", compact = false }: { template: string; q?: string; city?: string | null; compact?: boolean }) {
  const [query, setQuery] = useState(q);
  const [where, setWhere] = useState(city ?? "");
  const needsCity = template.includes("{city}");
  const needsQ = template.includes("{q}");
  const href = platformSearchLink(template, query, where);
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      }}
    >
      {needsQ && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="cosa cerchi"
          className={`h-8 rounded-sm border border-line-2 bg-card px-2 text-[13px] ${compact ? "w-40" : "w-56"}`}
        />
      )}
      {needsCity && (
        <input
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="città"
          className="h-8 w-28 rounded-sm border border-line-2 bg-card px-2 text-[13px]"
        />
      )}
      <button
        disabled={!href}
        className="inline-flex h-8 items-center gap-1 rounded-sm border border-line-2 bg-card px-2.5 text-[13px] hover:bg-n100 disabled:opacity-50"
      >
        <Search size={13} /> Cerca
      </button>
    </form>
  );
}
