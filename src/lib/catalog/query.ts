import type { Catalog, CatalogFilters, Course, CourseOffering, Material, PublicMaterial } from "../../domain/catalog";

export const categoryLabels = { listado: "Listados", apunte: "Apuntes", certamen: "Certámenes" } as const;
const singularLabels = { listado: "Listado", apunte: "Apuntes", certamen: "Certamen" } as const;

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

export function materialDisplayName(material: Pick<Material, "category" | "documentNumber">, offering: Pick<CourseOffering, "academicYear" | "academicTerm">): string {
  const number = material.documentNumber === null ? "" : ` ${material.documentNumber}`;
  return `${singularLabels[material.category]}${number} - ${offering.academicYear}-${offering.academicTerm}`;
}

export function approvedMaterials(catalog: Catalog): PublicMaterial[] {
  const courses = new Map(catalog.courses.map((course) => [course.id, course]));
  const offerings = new Map(catalog.offerings.map((offering) => [offering.id, offering]));
  return catalog.materials.flatMap((material) => {
    // Filtrar antes de resolver relaciones o producir metadatos públicos.
    if (material.status !== "approved") return [];
    const offering = offerings.get(material.offeringId);
    const course = offering && courses.get(offering.courseId);
    if (!offering || !course) return [];
    return [{
      id: material.id,
      course,
      category: material.category,
      documentNumber: material.documentNumber,
      displayName: materialDisplayName(material, offering),
      description: material.title,
      academicYear: offering.academicYear,
      academicTerm: offering.academicTerm,
      academicPeriod: `${offering.academicYear}-${offering.academicTerm}`,
      section: material.section,
      version: material.version,
    }];
  });
}

export function searchCatalog(catalog: Catalog, filters: CatalogFilters = {}): PublicMaterial[] {
  const words = normalizeSearch(filters.q ?? "").split(/\s+/).filter(Boolean);
  return approvedMaterials(catalog).filter((material) => {
    if (filters.curricularSemester !== undefined && material.course.curricularSemester !== filters.curricularSemester) return false;
    if (filters.category !== undefined && material.category !== filters.category) return false;
    if (filters.year !== undefined && material.academicYear !== filters.year) return false;
    if (filters.term !== undefined && material.academicTerm !== filters.term) return false;
    if (filters.number !== undefined && material.documentNumber !== filters.number) return false;
    const text = normalizeSearch(`${material.course.name} ${material.course.code ?? ""} ${material.displayName} ${categoryLabels[material.category]} ${material.description ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

/** Opciones y recuentos siempre desde la misma proyección approved-only. */
export function catalogFacets(catalog: Catalog) {
  const materials = approvedMaterials(catalog);
  return {
    years: [...new Set(materials.map((material) => material.academicYear))].sort((a, b) => b - a),
    curricularSemesters: [...new Set(materials.flatMap((material) => material.course.curricularSemester === null ? [] : [material.course.curricularSemester]))].sort((a, b) => a - b),
    count: materials.length,
  };
}

/** Los ramos existen independientemente de que tengan materiales aprobados. */
export function semesterCourses(catalog: Catalog, semester: number, query = ""): Course[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return catalog.courses.filter((course) => {
    const text = normalizeSearch(`${course.name} ${course.code ?? ""}`);
    return course.status === "active" && course.curricularSemester === semester && words.every((word) => text.includes(word));
  });
}

export function courseMaterials(catalog: Catalog, courseId: string, filters: CatalogFilters = {}): PublicMaterial[] {
  return searchCatalog(catalog, filters).filter((material) => material.course.id === courseId);
}

/** Opciones estables por ramo/categoría, nunca derivadas de filas privadas. */
export function courseFacets(catalog: Catalog, courseId: string, category?: CatalogFilters["category"]) {
  const materials = courseMaterials(catalog, courseId, { category });
  return {
    years: [...new Set(materials.map((material) => material.academicYear))].sort((a, b) => b - a),
    terms: [...new Set(materials.map((material) => material.academicTerm))].sort(),
    numbers: [...new Set(materials.flatMap((material) => material.documentNumber === null ? [] : [material.documentNumber]))].sort((a, b) => a - b),
    count: materials.length,
  };
}

/** Todo futuro acceso público por ID debe atravesar la misma proyección. */
export function publicMaterialById(catalog: Catalog, id: string): PublicMaterial | undefined {
  return approvedMaterials(catalog).find((material) => material.id === id);
}

/** Incluye ramos sin documentos. Archivar retira selectores, no borra materiales. */
export function searchCourses(catalog: Catalog, filters: { q?: string; curricularSemester?: number; electiveAreaId?: string; includeArchived?: boolean } = {}): Course[] {
  const words = normalizeSearch(filters.q ?? "").split(/\s+/).filter(Boolean);
  return catalog.courses.filter((course) => {
    if (!filters.includeArchived && course.status !== "active") return false;
    if (filters.curricularSemester !== undefined && course.curricularSemester !== filters.curricularSemester) return false;
    if (filters.electiveAreaId !== undefined && course.electiveAreaId !== filters.electiveAreaId) return false;
    const area = catalog.electiveAreas.find((entry) => entry.id === course.electiveAreaId);
    const text = normalizeSearch(`${course.name} ${course.code ?? ""} ${course.description ?? ""} ${area?.name ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

export function catalogSemesters(catalog: Catalog): number[] {
  return [...new Set([1, 2, 3, 4, ...catalog.courses.flatMap((course) => course.kind === "regular" && course.status === "active" ? [course.curricularSemester] : [])])].sort((a, b) => a - b);
}

export function courseClassification(course: Course, areas: Catalog["electiveAreas"]): string {
  return course.kind === "regular" ? `Semestre curricular ${course.curricularSemester}` : `Electivo · ${areas.find((area) => area.id === course.electiveAreaId)?.name ?? "Área no disponible"}`;
}

export function courseParentBreadcrumb(course: Course, areas: Catalog["electiveAreas"]) {
  return { label: courseClassification(course, areas), href: course.kind === "regular" ? `/semestres/${course.curricularSemester}` : `/electivos?area=${encodeURIComponent(course.electiveAreaId)}` };
}
