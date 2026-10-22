import type { ReactNode } from "react";

export function ContributionField({ name, label, hint, error, optional = false, children }: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return <div className="min-w-0">
    <label htmlFor={`contribution-${name}`} className="mb-2 block text-sm font-semibold">{label} <span className="font-normal text-muted-foreground">({optional ? "opcional" : "obligatorio"})</span></label>
    {children}
    {hint ? <p id={`contribution-${name}-hint`} className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    {error ? <p id={`contribution-${name}-error`} className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}
  </div>;
}
