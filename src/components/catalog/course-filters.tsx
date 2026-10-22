"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition, type FormEvent, type MouseEvent } from "react";
import type { CatalogFilters } from "@/domain/catalog";
import { courseCategoryValues, courseHref, parseCourseFilters } from "@/lib/catalog/course-filters";
import { Button } from "@/components/ui/button";
import { CategoryNavigation } from "./category-navigation";

type CourseFiltersProps = {
  slug: string;
  filters: CatalogFilters;
  years: readonly number[];
  numbers: readonly number[];
};

function optionsIncludingSelected(options: readonly number[], selected?: number) {
  return [...new Set([...options, ...(selected === undefined ? [] : [selected])])];
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function CourseFilters({ slug, filters, years, numbers }: CourseFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(filters);
  const category = selected.category ?? "listado";

  function navigate(next: CatalogFilters) {
    startTransition(() => {
      setSelected(next);
      router.push(courseHref(slug, next), { scroll: false });
    });
  }

  function applyForm(form: HTMLFormElement) {
    // Read all current controls, not stale server props, for consecutive changes.
    const data = new FormData(form);
    const { filters: next, errors } = parseCourseFilters({
      tipo: String(data.get("tipo") ?? ""),
      anio: String(data.get("anio") ?? ""),
      periodo: String(data.get("periodo") ?? ""),
      numero: String(data.get("numero") ?? ""),
    });
    if (!errors.length) navigate(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyForm(event.currentTarget);
  }

  return (
    <div>
      <CategoryNavigation slug={slug} filters={{ ...selected, category }} onNavigate={(event, nextCategory) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        navigate({ ...selected, category: nextCategory });
      }} />
      <form action={`/ramos/${slug}`} method="get" onSubmit={submit} onChange={(event) => applyForm(event.currentTarget)} aria-label="Filtrar materiales del ramo" aria-describedby="course-filter-hint" className="my-6 rounded-xl border border-border bg-card p-5 sm:p-6">
        <input type="hidden" name="tipo" value={courseCategoryValues[category]} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label htmlFor="course-year" className="text-sm font-medium">Año académico
            <select id="course-year" name="anio" value={selected.year ?? ""} onChange={() => {}} className="field mt-2">
              <option value="">Todos los años</option>
              {optionsIncludingSelected(years, selected.year).sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label htmlFor="course-term" className="text-sm font-medium">Semestre académico
            <select id="course-term" name="periodo" value={selected.term ?? ""} onChange={() => {}} className="field mt-2">
              <option value="">Ambos semestres</option><option value="1">1 (período AAAA-1)</option><option value="2">2 (período AAAA-2)</option>
            </select>
          </label>
          <label htmlFor="course-number" className="text-sm font-medium">Número de documento
            <select id="course-number" name="numero" value={selected.number ?? ""} onChange={() => {}} className="field mt-2">
              <option value="">Todos los números</option>
              {optionsIncludingSelected(numbers, selected.number).sort((a, b) => a - b).map((number) => <option key={number} value={number}>{number}</option>)}
            </select>
          </label>
        </div>
        <p id="course-filter-hint" className="mt-4 text-sm text-muted-foreground">Los resultados se actualizan al cambiar un filtro. El período académico indica cuándo se dictó el ramo; no cambia su semestre curricular.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Button type="submit" variant="outline" className="min-h-11 px-4">Aplicar filtros</Button>
          <Link href={courseHref(slug, { category })} className="text-link inline-flex min-h-11 items-center rounded text-sm font-semibold" onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            navigate({ category });
          }}>Limpiar filtros</Link>
          <p role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-sm text-muted-foreground">{pending ? "Actualizando resultados…" : "Filtros listos."}</p>
        </div>
      </form>
    </div>
  );
}
