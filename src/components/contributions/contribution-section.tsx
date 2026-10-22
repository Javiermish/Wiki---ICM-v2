import type { ReactNode } from "react";

export function ContributionSection({ number, title, description, children }: {
  number: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <section aria-labelledby={`contribution-section-${number}`} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div className="mb-6 flex items-start gap-3 sm:gap-4">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{number}</span>
      <div className="min-w-0">
        <h2 id={`contribution-section-${number}`} className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    {children}
  </section>;
}
