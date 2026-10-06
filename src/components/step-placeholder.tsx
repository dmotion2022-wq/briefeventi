import { EmptyState } from "@/components/ui/empty-state";

export function StepPlaceholder({ title, children }: { title: string; children: React.ReactNode }) {
  return <EmptyState title={title}>{children}</EmptyState>;
}
