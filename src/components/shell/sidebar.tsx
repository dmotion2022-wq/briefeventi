"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  Building,
  Download,
  FolderKanban,
  Receipt,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";

const groups = [
  {
    label: null,
    items: [{ href: "/", label: "Progetti", icon: FolderKanban, exact: false, match: ["/", "/projects"] }],
  },
  {
    label: "Archivio",
    items: [
      { href: "/library/suppliers", label: "Fornitori", icon: Users },
      { href: "/library/venues", label: "Location e hotel", icon: Building },
      { href: "/library/works", label: "Proposte passate", icon: Archive },
      { href: "/library/benchmarks", label: "Listino", icon: Receipt },
      { href: "/library/formats", label: "Format innovativi", icon: Sparkles },
      { href: "/library/import", label: "Import da Drive", icon: Download },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/runs", label: "Log AI e costi", icon: Activity },
      { href: "/settings", label: "Impostazioni", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string, match?: string[]) {
  if (match) return match.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m)));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-ink px-3 py-5 text-paper">
      <Link href="/" className="mb-7 px-2">
        <Logo />
      </Link>
      <nav className="flex flex-1 flex-col gap-6">
        {groups.map((group, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {group.label && (
              <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-n400">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, "match" in item ? item.match : undefined);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] transition-colors",
                    active ? "bg-n700 text-white" : "text-n300 hover:bg-n700/60 hover:text-white",
                  )}
                >
                  <Icon size={16} strokeWidth={1.75} className={active ? "text-amber" : undefined} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="spectrum-bar mx-2 h-0.5 rounded-full opacity-80" />
      <div className="mt-3 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-n500">Uso personale · locale</div>
    </aside>
  );
}
