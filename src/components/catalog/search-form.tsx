import { Search, SlidersHorizontal } from "lucide-react";
import Form from "next/form";
import { Button } from "@/components/ui/button";
import type { CatalogFilters } from "@/domain/catalog";
import { categoryLabels } from "@/lib/catalog/query";

export function SearchForm({ filters, years }: { filters: CatalogFilters; years: readonly number[] }) {
  const expanded = [filters.curricularSemester, filters.category, filters.year, filters.term, filters.number].some((value) => value !== undefined);
  return (
    <Form action="/#materiales" role="search" aria-label="Buscar en el catálogo de ejemplo" className="mt-8 max-w-3xl">
      <label htmlFor="q" className="mb-2 block text-sm font-semibold">Busca un ramo o material</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-3.5 left-4 size-5 text-muted-foreground" aria-hidden="true" />
          <input key={filters.q ?? ""} id="q" name="q" type="search" defaultValue={filters.q} maxLength={200} placeholder="Por ejemplo: Cálculo I o Certamen 2" aria-describedby="search-hint" className="field min-h-12 pl-12" />
        </div>
        <Button type="submit" className="min-h-12 bg-background px-6 text-foreground hover:bg-secondary">Buscar</Button>
      </div>
      <p id="search-hint" className="mt-2 text-sm text-[var(--hero-muted)]">Solo materiales aprobados ficticios. También puedes buscar un período como 2024-2.</p>
      <details open={expanded || undefined} className="mt-4">
        <summary className="w-fit min-h-11 rounded-md py-2 text-sm font-semibold underline-offset-4 hover:underline">
          <SlidersHorizontal className="mr-2 inline size-4" aria-hidden="true" />Afinar búsqueda (opcional)
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium" htmlFor="curricularSemester">Semestre curricular
            <input key={filters.curricularSemester ?? ""} id="curricularSemester" name="curricularSemester" type="number" min="1" max="20" placeholder="Todos" defaultValue={filters.curricularSemester} className="field mt-1" />
          </label>
          <label className="text-sm font-medium" htmlFor="category">Tipo de material
            <select key={filters.category ?? ""} id="category" name="category" defaultValue={filters.category ?? ""} className="field mt-1">
              <option value="">Todos los tipos</option>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="year">Año académico
            <select key={filters.year ?? ""} id="year" name="year" defaultValue={filters.year ?? ""} className="field mt-1">
              <option value="">Todos los años</option>
              {[...new Set([...years, ...(filters.year ? [filters.year] : [])])].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="term">Semestre académico
            <select key={filters.term ?? ""} id="term" name="term" defaultValue={filters.term ?? ""} className="field mt-1">
              <option value="">Ambos semestres</option><option value="1">1 (período AAAA-1)</option><option value="2">2 (período AAAA-2)</option>
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="number">Número de documento
            <input key={filters.number ?? ""} id="number" name="number" type="number" min="1" max="999" placeholder="Todos" defaultValue={filters.number} className="field mt-1" />
          </label>
        </div>
        <p className="mt-3 text-sm text-[var(--hero-muted)]">Los filtros se combinan al pulsar Buscar. El semestre curricular ubica el ramo; el período académico indica cuándo se dictó.</p>
      </details>
    </Form>
  );
}
