import type { Course, ElectiveArea, PublicCatalog } from "../../domain/catalog";
import type { NormalizedCourseInput } from "../../domain/course-management";

export interface CourseRow {
  id: string; slug: string; curriculum_id: string; name: string; code: string | null;
  description: string | null; kind: string; curricular_semester: number | null;
  elective_area_id: string | null; status: string; version: number;
}

export function courseFromRow(row: CourseRow): Course {
  const base = { id: row.id, slug: row.slug, curriculumId: row.curriculum_id, name: row.name, code: row.code, description: row.description, version: row.version };
  if (row.status !== "active" && row.status !== "archived") throw new Error("Estado de catálogo inválido.");
  if (row.kind === "regular" && Number.isInteger(row.curricular_semester) && row.curricular_semester! >= 1 && row.curricular_semester! <= 12 && row.elective_area_id === null) {
    return { ...base, status: row.status, kind: "regular", curricularSemester: row.curricular_semester!, electiveAreaId: null };
  }
  if (row.kind === "elective" && row.curricular_semester === null && typeof row.elective_area_id === "string" && row.elective_area_id) {
    return { ...base, status: row.status, kind: "elective", curricularSemester: null, electiveAreaId: row.elective_area_id };
  }
  throw new Error("Clasificación de catálogo inválida.");
}

export function courseToRow(input: NormalizedCourseInput) {
  return { name: input.name, code: input.code, description: input.description, kind: input.kind, curricular_semester: input.curricularSemester, elective_area_id: input.electiveAreaId };
}

/** Las muestras locales no proporcionan ramos ni áreas al catálogo persistente. */
export function attachExampleMaterials(courses: Course[], electiveAreas: readonly ElectiveArea[], examples: PublicCatalog): PublicCatalog {
  const ids = new Set(courses.map((course) => course.id));
  const offerings = examples.offerings.filter((offering) => ids.has(offering.courseId));
  const offeringIds = new Set(offerings.map((offering) => offering.id));
  return { courses, electiveAreas, offerings, materials: examples.materials.filter((material) => offeringIds.has(material.offeringId)) };
}
