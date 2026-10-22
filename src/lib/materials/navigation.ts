import type { CatalogFilters } from "../../domain/catalog";
import { courseHref } from "../catalog/course-filters.ts";

/** Reutiliza el contrato del ramo; no acepta URLs de retorno arbitrarias. */
export function materialHref(id: string, courseFilters?: CatalogFilters): string {
  const query = courseFilters ? courseHref("contexto", courseFilters).split("?")[1] : undefined;
  return `/materiales/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}
