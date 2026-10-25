import type { AcademicTerm, PublicCatalog, PublicCatalogMaterial } from "../../domain/catalog";

export interface PublicMaterialRow {
  id: string; offering_id: string; course_id: string; academic_year: number; academic_term: AcademicTerm;
  category: "listado" | "apunte" | "certamen" | "tarea"; document_number: number | null;
  title: string | null; description: string | null; section: string | null;
  instructor: string | null; version: string | null; mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  bytes: number; extension: "pdf" | "jpg" | "png" | "webp";
}

/** Explicit allowlist: never spread a database row into the public catalog. */
export function attachPersistentMaterials(catalog: PublicCatalog, rows: readonly PublicMaterialRow[]): PublicCatalog {
  const courseIds = new Set(catalog.courses.map((course) => course.id));
  const offerings = new Map(catalog.offerings.map((offering) => [offering.id, offering]));
  const materials: PublicCatalogMaterial[] = [...catalog.materials];
  for (const row of rows) {
    if (!courseIds.has(row.course_id)) continue;
    if (!["listado", "apunte", "certamen", "tarea"].includes(row.category) || !Number.isInteger(row.academic_year) || ![1, 2].includes(row.academic_term)
      || (row.document_number === null ? row.category !== "apunte" : !Number.isInteger(row.document_number) || row.document_number < 1 || row.document_number > 999)) throw new Error("Metadatos académicos inválidos.");
    offerings.set(row.offering_id, { id: row.offering_id, courseId: row.course_id, academicYear: row.academic_year, academicTerm: row.academic_term });
    const base = { id: row.id, offeringId: row.offering_id, title: row.title, description: row.description, status: "approved" as const,
      ...(row.section ? { section: row.section } : {}), ...(row.version ? { version: row.version } : {}) };
    materials.push(row.category === "apunte" ? { ...base, category: "apunte", documentNumber: row.document_number }
      : { ...base, category: row.category, documentNumber: row.document_number! });
  }
  return { ...catalog, offerings: [...offerings.values()], materials };
}
