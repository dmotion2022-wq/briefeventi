"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { parseItalianAmount } from "@/lib/money";

const base =
  "h-8 w-full rounded-xs border border-transparent bg-transparent px-1.5 text-[13px] hover:border-line-2 focus:border-violet focus:bg-card focus:outline-none disabled:hover:border-transparent";

const fmtNumber = (n: number | null | undefined, decimals = 2) =>
  n == null ? "" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimals, useGrouping: false }).format(n);

/** Importo in euro scritto all'italiana ("1.234,50"); restituisce centesimi. */
export function MoneyInput({
  cents,
  onCommit,
  nullable,
  className,
  ...rest
}: {
  cents: number | null | undefined;
  onCommit: (cents: number | null) => void;
  nullable?: boolean;
} & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const format = (c: number | null | undefined) =>
    c == null ? "" : new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
  const [text, setText] = useState(format(cents));
  // il valore cambia da fuori (salvataggio, ricarica): si riallinea il testo durante il render
  const [prev, setPrev] = useState(cents);
  if (cents !== prev) {
    setPrev(cents);
    setText(format(cents));
  }
  return (
    <input
      {...rest}
      inputMode="decimal"
      className={cn(base, "tabular text-right", className)}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        if (!text.trim()) {
          onCommit(nullable ? null : 0);
          setText(nullable ? "" : format(0));
          return;
        }
        const parsed = parseItalianAmount(text);
        if (parsed == null) {
          setText(format(cents));
          return;
        }
        onCommit(parsed);
        setText(format(parsed));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Numero con virgola decimale; per le percentuali si passa e si riceve il valore in %. */
export function NumberInput({
  value,
  onCommit,
  decimals = 2,
  nullable,
  className,
  ...rest
}: {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  decimals?: number;
  nullable?: boolean;
} & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const [text, setText] = useState(fmtNumber(value, decimals));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(fmtNumber(value, decimals));
  }
  return (
    <input
      {...rest}
      inputMode="decimal"
      className={cn(base, "tabular text-right", className)}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const t = text.trim().replace(/\./g, "").replace(",", ".");
        if (!t) {
          onCommit(nullable ? null : 0);
          return;
        }
        const n = Number(t);
        if (!Number.isFinite(n)) {
          setText(fmtNumber(value, decimals));
          return;
        }
        onCommit(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TextInput({
  value,
  onCommit,
  className,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  return (
    <input
      {...rest}
      className={cn(base, className)}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function MiniSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(base, "pr-5", className)} {...props} />;
}
