import type { Catalog, PublicCatalog, PublicCatalogMaterial } from "../../domain/catalog";

/** Allowlist real compartida por SSR y pruebas. No copiar el catálogo privado al cliente. */
export function toPublicCatalog(catalog: Catalog): PublicCatalog {
  const materials = catalog.materials.flatMap((material): PublicCatalogMaterial[] => {
    if (material.status !== "approved") return [];
    const base = {
      id: material.id, offeringId: material.offeringId, title: material.title, status: "approved" as const,
      ...(material.section ? { section: material.section } : {}),
      ...(material.version ? { version: material.version } : {}),
    };
    return [material.category === "apunte"
      ? { ...base, category: material.category, documentNumber: material.documentNumber }
      : { ...base, category: material.category, documentNumber: material.documentNumber }];
  });
  const offeringIds = new Set(materials.map((material) => material.offeringId));
  return {
    courses: catalog.courses,
    electiveAreas: catalog.electiveAreas,
    materials,
    offerings: catalog.offerings.filter((offering) => offeringIds.has(offering.id)),
  };
}
