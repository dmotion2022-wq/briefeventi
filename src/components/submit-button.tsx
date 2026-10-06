"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} variant={variant} size={size}>
      {pending && <LoaderCircle size={14} className="animate-spin" />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
