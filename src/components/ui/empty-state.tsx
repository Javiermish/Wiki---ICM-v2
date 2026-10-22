import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-input bg-card px-6 py-10 text-center">
      <SearchX className="mx-auto mb-4 size-7 text-primary" aria-hidden="true" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
