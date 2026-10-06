import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Table = ({ className, ...p }: ComponentProps<"table">) => (
  <table className={cn("w-full text-left text-[13px]", className)} {...p} />
);
export const THead = ({ className, ...p }: ComponentProps<"thead">) => (
  <thead className={cn("border-b border-line", className)} {...p} />
);
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cn("eyebrow px-3 py-2.5 font-normal first:pl-5 last:pr-5", className)} {...p} />
);
export const Tr = ({ className, ...p }: ComponentProps<"tr">) => (
  <tr className={cn("border-b border-line align-top last:border-0 hover:bg-paper/60", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("px-3 py-2.5 first:pl-5 last:pr-5", className)} {...p} />
);
