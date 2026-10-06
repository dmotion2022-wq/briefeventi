"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const PROJECT_STEPS = [
  { slug: "brief", label: "Brief" },
  { slug: "gaps", label: "Lacune" },
  { slug: "concepts", label: "Concept" },
  { slug: "agenda", label: "Scaletta" },
  { slug: "develop", label: "Sviluppo" },
  { slug: "images", label: "Immagini" },
  { slug: "quote", label: "Preventivo" },
  { slug: "suppliers", label: "Fornitori" },
  { slug: "check", label: "Controllo" },
  { slug: "exports", label: "Export" },
] as const;

export function StepNav({ projectId, done }: { projectId: string; done: string[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {PROJECT_STEPS.map((step, i) => {
        const href = `/projects/${projectId}/${step.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={step.slug}
            href={href}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] transition-colors",
              active ? "border-violet font-medium text-ink" : "border-transparent text-n500 hover:text-ink",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px]",
                done.includes(step.slug) ? "bg-ok text-white" : active ? "bg-violet text-white" : "bg-n100 text-n500",
              )}
            >
              {done.includes(step.slug) ? "✓" : i + 1}
            </span>
            {step.label}
          </Link>
        );
      })}
    </nav>
  );
}
