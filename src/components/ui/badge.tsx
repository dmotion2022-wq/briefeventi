import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "violet" | "magenta" | "amber" | "ok" | "warn" | "dark";

const tones: Record<Tone, string> = {
  neutral: "bg-n100 text-n700",
  violet: "bg-violet-soft text-violet",
  magenta: "bg-magenta-soft text-magenta",
  amber: "bg-amber-soft text-[#8a5a00]",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  dark: "bg-ink text-paper",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
