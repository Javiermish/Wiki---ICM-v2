import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="mb-5 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-2">
            {index > 0 ? <ChevronRight className="size-3" aria-hidden="true" /> : null}
            {item.href && index < items.length - 1 ? (
              <Link className="inline-flex min-h-11 items-center rounded underline underline-offset-4 hover:text-primary" href={item.href}>{item.label}</Link>
            ) : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
