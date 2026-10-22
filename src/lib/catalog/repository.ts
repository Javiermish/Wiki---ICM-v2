import type { Catalog, Course } from "../../domain/catalog";
import type { CourseInput, CourseListOptions } from "../../domain/course-management";
import { CourseValidationError, normalizeCourseText, validateCourseInput } from "../../domain/course-management.ts";

export { CourseValidationError } from "../../domain/course-management.ts";

export interface DemoCourseRepository {
  getCatalog(): Catalog;
  listCourses(options?: CourseListOptions): Course[];
  getCourse(id: string): Course | undefined;
  getCourseBySlug(slug: string): Course | undefined;
  createCourse(input: CourseInput): Course;
  updateCourse(id: string, input: CourseInput): Course;
  setCourseArchived(id: string, archived: boolean): Course;
}

/** Copia defensiva: los snapshots y sus filas no se modifican desde fuera. */
function immutableCatalog(catalog: Catalog): Catalog {
  return Object.freeze({
    electiveAreas: Object.freeze(catalog.electiveAreas.map((area) => Object.freeze({ ...area }))),
    courses: Object.freeze(catalog.courses.map((course) => Object.freeze({ ...course }))),
    offerings: Object.freeze(catalog.offerings.map((offering) => Object.freeze({ ...offering }))),
    materials: Object.freeze(catalog.materials.map((material) => Object.freeze({ ...material }))),
  });
}

/** Adaptador síncrono DEMO, aislado y solo en memoria. Crear una instancia explícita
 * por demo; nunca singleton en servidor ni persistencia web. getCatalog es un snapshot
 * INTERNO con fixtures privados de ejemplo: no es una respuesta pública de materiales.
 * No crea ofertas/documentos, no borra y no implementa los puertos de backend futuro.
 */
export function createDemoCourseRepository(
  initial: Catalog,
  generateId: () => string = () => globalThis.crypto.randomUUID(),
): DemoCourseRepository {
  let catalog = immutableCatalog(initial);
  const curriculumId = initial.courses[0]?.curriculumId ?? "plan-ilustrativo";
  const getCourse = (id: string) => catalog.courses.find((course) => course.id === id);
  const requireCourse = (id: string): Course => {
    const course = getCourse(id);
    if (!course) throw new RangeError("No existe el ramo solicitado en esta demostración.");
    return course;
  };
  const replaceCourse = (course: Course): Course => {
    catalog = Object.freeze({ ...catalog, courses: Object.freeze(catalog.courses.map((current) => current.id === course.id ? course : current)) });
    return course;
  };
  const validated = (input: CourseInput, excludeId?: string) => {
    const validation = validateCourseInput(input, catalog, excludeId);
    if (!validation.value) throw new CourseValidationError(validation);
    return validation.value;
  };

  return Object.freeze({
    getCatalog: () => catalog,
    getCourse,
    getCourseBySlug: (slug: string) => catalog.courses.find((course) => course.slug === slug),
    listCourses(options: CourseListOptions = {}): Course[] {
      const tokens = normalizeCourseText(options.q ?? "").split(" ").filter(Boolean);
      return catalog.courses.filter((course) => {
        if (!options.includeArchived && course.status === "archived") return false;
        if (options.kind !== undefined && course.kind !== options.kind) return false;
        if (options.electiveAreaId !== undefined && course.electiveAreaId !== options.electiveAreaId) return false;
        if (options.curricularSemester !== undefined && course.curricularSemester !== options.curricularSemester) return false;
        const haystack = normalizeCourseText(`${course.name} ${course.code ?? ""} ${course.description ?? ""}`);
        return tokens.every((token) => haystack.includes(token));
      });
    },
    createCourse(input: CourseInput): Course {
      const value = validated(input);
      const id = generateId();
      if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(id) || getCourse(id)) {
        throw new Error("El generador DEMO debe entregar un ID nuevo y seguro para una ruta.");
      }
      // Derivado solo de la identidad: renombrar o mover de área no rompe enlaces.
      const slug = `local-${id}`;
      if (catalog.courses.some((course) => course.slug === slug)) throw new Error("El slug DEMO generado ya existe.");
      const course: Course = Object.freeze({ ...value, id, slug, curriculumId, status: "active" });
      catalog = Object.freeze({ ...catalog, courses: Object.freeze([...catalog.courses, course]) });
      return course;
    },
    updateCourse(id: string, input: CourseInput): Course {
      const original = requireCourse(id);
      const value = validated(input, id);
      // Solo los campos normalizados son editables; preserva identidad/estado/plan.
      return replaceCourse(Object.freeze({ ...value, id: original.id, slug: original.slug, curriculumId: original.curriculumId, status: original.status }));
    },
    setCourseArchived(id: string, archived: boolean): Course {
      if (typeof archived !== "boolean") throw new TypeError("El estado de archivo debe ser booleano.");
      const original = requireCourse(id);
      return replaceCourse(Object.freeze({ ...original, status: archived ? "archived" : "active" }));
    },
  });
}
