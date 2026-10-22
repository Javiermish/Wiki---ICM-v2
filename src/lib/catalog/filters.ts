import type { AcademicTerm, CatalogFilters, MaterialCategory } from "../../domain/catalog";

export type SearchParameters = Record<string, string | string[] | undefined>;
export const filterKeys = ["q", "curricularSemester", "category", "year", "term", "number"] as const;

export function parseCatalogFilters(params: SearchParameters): { filters: CatalogFilters; errors: string[] } {
  const filters: { -readonly [K in keyof CatalogFilters]: CatalogFilters[K] } = {};
  const errors: string[] = [];
  const labels = { q: "Búsqueda", curricularSemester: "Semestre curricular", category: "Tipo de material", year: "Año académico", term: "Semestre académico", number: "Número de documento" };

  for (const key of filterKeys) {
    const raw = params[key];
    if (Array.isArray(raw)) {
      errors.push(`${labels[key]}: usa un solo valor.`);
      continue;
    }
    const value = raw?.trim();
    if (!value) continue;
    if (key === "q") {
      if (value.length > 200) errors.push("Búsqueda: escribe como máximo 200 caracteres.");
      else filters.q = value;
    } else if (key === "category") {
      if (["listado", "apunte", "certamen"].includes(value)) filters.category = value as MaterialCategory;
      else errors.push("Tipo de material: elige Listados, Apuntes o Certámenes.");
    } else {
      const bounds = { curricularSemester: [1, 20], year: [1900, 2100], term: [1, 2], number: [1, 999] } as const;
      const [min, max] = bounds[key];
      const number = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
        errors.push(`${labels[key]}: usa un número entero entre ${min} y ${max}.`);
      } else if (key === "term") filters.term = number as AcademicTerm;
      else filters[key] = number;
    }
  }
  return { filters, errors };
}

export function catalogHref(filters: CatalogFilters, anchor = "materiales"): string {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return `/${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`;
}

export function hasCatalogFilters(filters: CatalogFilters): boolean {
  return filterKeys.some((key) => filters[key] !== undefined && filters[key] !== "");
}
