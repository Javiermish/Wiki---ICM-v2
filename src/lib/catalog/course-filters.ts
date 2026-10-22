import type { CatalogFilters, MaterialCategory } from "../../domain/catalog";
import { parseCatalogFilters, type SearchParameters } from "./filters.ts";

export const courseCategoryValues = { listado: "listados", apunte: "apuntes", certamen: "certamenes" } as const;
const categories: Record<string, MaterialCategory> = { listados: "listado", apuntes: "apunte", certamenes: "certamen" };

/** Contrato público del ramo. No acepta ni altera el semestre curricular. */
export function parseCourseFilters(params: SearchParameters): { filters: CatalogFilters; errors: string[] } {
  const type = params.tipo;
  const category = typeof type === "string" && Object.hasOwn(categories, type.trim()) ? categories[type.trim()] : undefined;
  const parsed = parseCatalogFilters({ year: params.anio, term: params.periodo, number: params.numero });
  const errors = [...parsed.errors];
  if (Array.isArray(type)) errors.unshift("Tipo de material: usa un solo valor.");
  else if (type?.trim() && !category) errors.unshift("Tipo de material: elige Listados, Apuntes o Certámenes.");
  return { filters: { ...parsed.filters, category: category ?? "listado" }, errors };
}

export function courseHref(slug: string, filters: CatalogFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("tipo", courseCategoryValues[filters.category]);
  if (filters.year !== undefined) params.set("anio", String(filters.year));
  if (filters.term !== undefined) params.set("periodo", String(filters.term));
  if (filters.number !== undefined) params.set("numero", String(filters.number));
  const query = params.toString();
  return `/ramos/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`;
}
