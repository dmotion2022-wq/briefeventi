import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-2 bg-card/60 px-6 py-12 text-center">
      <div className="text-[15px] font-semibold">{title}</div>
      {children && <div className="max-w-md text-[13px] text-n500">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
