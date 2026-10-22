import "server-only";
import type { Catalog, PublicCatalog } from "@/domain/catalog";
import { demoCatalog } from "@/fixtures/catalog";
import { catalogSemesters } from "./query";
import { toPublicCatalog } from "./public-catalog";

/** Fuente inicial de solo lectura. Nunca se mantiene estado mutable por petición. */
export function getDemoCatalog(): Catalog {
  return demoCatalog;
}

export function getDemoSemesters(catalog: Catalog): number[] {
  return catalogSemesters(catalog);
}

/** Única semilla enviada al navegador: sin filas ni metadatos privados. */
export function getPublicDemoCatalog(): PublicCatalog {
  return toPublicCatalog(demoCatalog);
}
