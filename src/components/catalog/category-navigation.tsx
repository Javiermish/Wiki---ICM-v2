import Link from "next/link";
import type { MouseEvent } from "react";
import type { CatalogFilters, MaterialCategory } from "@/domain/catalog";
import { categoryLabels } from "@/lib/catalog/query";
import { courseHref } from "@/lib/catalog/course-filters";

export function CategoryNavigation({ slug, filters, onNavigate }: { slug: string; filters: CatalogFilters; onNavigate?: (event: MouseEvent<HTMLAnchorElement>, category: MaterialCategory) => void }) {
  return (
    <nav aria-label="Categorías de materiales" className="mt-8 border-b border-border">
      <ul className="flex flex-wrap gap-x-2">
        {(Object.keys(categoryLabels) as MaterialCategory[]).map((category) => (
          <li key={category}><Link href={courseHref(slug, { ...filters, category })} onClick={onNavigate ? (event) => onNavigate(event, category) : undefined} aria-current={filters.category === category ? "page" : undefined} className={`inline-flex min-h-12 items-center rounded-t-lg border-b-2 px-4 text-sm font-semibold ${filters.category === category ? "border-primary bg-secondary text-secondary-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{categoryLabels[category]}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
