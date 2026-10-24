import type { Catalog, Course, ElectiveArea } from "./catalog";

/** Áreas ilustrativas, no una clasificación oficial de la universidad. */
export const initialElectiveAreas: readonly ElectiveArea[] = Object.freeze([
  { id: "numerico", name: "Numérico" },
  { id: "discreta", name: "Discreta" },
  { id: "optimizacion", name: "Optimización" },
  { id: "estadistica", name: "Estadística" },
  { id: "otro", name: "Otro" },
].map((area) => Object.freeze(area)));

/** No acepta ID, slug, plan, estado, identidad ni rol desde el formulario. */
export interface CourseInput {
  readonly name: string;
  readonly code: string;
  readonly kind: Course["kind"];
  readonly curricularSemester: string;
  readonly electiveAreaId: string;
  readonly description: string;
}

export type CourseFieldErrors = Partial<Record<keyof CourseInput, string>>;
export type NormalizedCourseInput = Pick<Course, "name" | "code" | "description"> & (
  | { readonly kind: "regular"; readonly curricularSemester: number; readonly electiveAreaId: null }
  | { readonly kind: "elective"; readonly curricularSemester: null; readonly electiveAreaId: string }
);

export interface CourseValidation {
  readonly errors: CourseFieldErrors;
  /** Incluye coincidencias exactas bloqueantes y aproximadas solo informativas. */
  readonly duplicates: Course[];
  readonly value?: NormalizedCourseInput;
}

export const courseInputLimits = Object.freeze({ name: 160, code: 40, description: 2000 });

const text = (value: unknown): string => typeof value === "string" ? value.normalize("NFC").trim() : "";
const singleLine = (value: unknown): string => text(value).replace(/\s+/g, " ");
/** V1: identidad latina ASCII tras NFD; misma clasificación explícita que PostgreSQL. */
export const normalizeCourseText = (value: string): string => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const hasControlCharacters = (value: string, multiline = false): boolean => [...value].some((character) => {
  const code = character.charCodeAt(0);
  return (code < 32 && !(multiline && [9, 10, 13].includes(code))) || code === 127;
});

function nearlyEqual(left: string, right: string): boolean {
  if (Math.min(left.length, right.length) < 5 || Math.abs(left.length - right.length) > 2) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    if (Math.min(...row) > 2) return false;
    previous = row;
  }
  return previous[right.length] <= 2;
}

function similarNames(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 5 && (left.includes(right) || right.includes(left))) return true;
  const a = new Set(left.split(" "));
  const b = new Set(right.split(" "));
  const common = [...a].filter((token) => token.length > 2 && b.has(token)).length;
  return (common >= 1 && common / Math.max(a.size, b.size) >= 0.6) || nearlyEqual(left, right);
}

/** Validación local reutilizable, NO autorización ni validación suficiente de servidor.
 * Política DEMO sobre todo el catálogo (incluye archivados): código no vacío y nombre
 * exactamente normalizado son únicos. Coincidencias aproximadas se devuelven como
 * advertencias en duplicates, sin bloquear ni fusionar registros silenciosamente.
 * Los campos de la otra variante se descartan para permitir cambiar de tipo en UI.
 */
export function validateCourseInput(input: CourseInput, catalog: Catalog, excludeId?: string): CourseValidation {
  const errors: CourseFieldErrors = {};
  const raw: Partial<Record<keyof CourseInput, unknown>> = input && typeof input === "object" ? input : {};
  const name = singleLine(raw.name);
  const code = singleLine(raw.code).toUpperCase();
  const description = text(raw.description);
  const semesterText = text(raw.curricularSemester);
  const electiveAreaId = text(raw.electiveAreaId);
  const semester = Number(semesterText);

  for (const field of ["name", "code", "curricularSemester", "electiveAreaId", "description"] as const) {
    if (typeof raw[field] !== "string") errors[field] = "Introduce un texto válido.";
  }
  if (name.length < 2 || name.length > courseInputLimits.name) errors.name = `Usa entre 2 y ${courseInputLimits.name} caracteres para el nombre.`;
  if (!/^[\x20-\x7e–—‘’“”¿¡·]+$/u.test(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) || !normalizeCourseText(name)) {
    errors.name = "Usa letras latinas (pueden llevar acentos), números del 0 al 9 y puntuación habitual para el nombre.";
  }
  if (hasControlCharacters(text(raw.name))) errors.name = "El nombre no admite caracteres de control.";
  if (code.length > courseInputLimits.code || (code !== "" && !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(code))) {
    errors.code = `Usa hasta ${courseInputLimits.code} letras, números, espacios o . _ / - para el código.`;
  }
  if (hasControlCharacters(text(raw.code))) errors.code = "El código no admite caracteres de control.";
  if (description.length > courseInputLimits.description) errors.description = `Usa hasta ${courseInputLimits.description} caracteres para la descripción.`;
  if (hasControlCharacters(description, true)) errors.description = "La descripción contiene caracteres de control no válidos.";
  if (raw.kind !== "regular" && raw.kind !== "elective") errors.kind = "Elige ramo regular o electivo.";
  if (raw.kind === "regular" && (!/^\d+$/.test(semesterText) || !Number.isSafeInteger(semester) || semester < 1 || semester > 12)) {
    errors.curricularSemester = "Elige un semestre curricular entero entre 1 y 12.";
  }
  if (raw.kind === "elective" && !catalog.electiveAreas.some((area) => area.id === electiveAreaId)) {
    errors.electiveAreaId = "Elige un área de electivos existente.";
  }

  const nameKey = normalizeCourseText(name);
  const duplicates = catalog.courses.filter((course) => {
    if (course.id === excludeId) return false;
    const sameCode = code !== "" && course.code !== null && course.code.toUpperCase().trim() === code;
    const courseNameKey = normalizeCourseText(course.name);
    if (sameCode) errors.code = "Ya existe un ramo con este código (puede estar archivado).";
    if (nameKey !== "" && courseNameKey === nameKey) errors.name = "Ya existe un ramo con este nombre (puede estar archivado).";
    return sameCode || similarNames(nameKey, courseNameKey);
  });
  if (Object.keys(errors).length) return { errors, duplicates };
  const common = { name, code: code || null, description: description || null };
  const value: NormalizedCourseInput = raw.kind === "regular"
    ? { ...common, kind: "regular", curricularSemester: semester, electiveAreaId: null }
    : { ...common, kind: "elective", curricularSemester: null, electiveAreaId };
  return { errors, duplicates, value };
}

export class CourseValidationError extends Error {
  readonly errors: CourseFieldErrors;
  readonly duplicates: Course[];

  constructor(validation: Pick<CourseValidation, "errors" | "duplicates">) {
    super("Revisa los datos del ramo antes de continuar.");
    this.name = "CourseValidationError";
    this.errors = { ...validation.errors };
    this.duplicates = [...validation.duplicates];
  }
}

export interface CourseListOptions {
  readonly q?: string;
  readonly includeArchived?: boolean;
  readonly kind?: Course["kind"];
  readonly electiveAreaId?: string;
  readonly curricularSemester?: number;
}

/** Puertos ASÍNCRONOS futuros; la UI no necesita conocer HTTP, SQL ni Supabase.
 * El servidor impondrá sesión verificada/roles y RLS en cada mutación, revalidará
 * duplicados transaccionalmente y protegerá todo archivo pendiente con Storage privado.
 * Ninguno de estos contratos implica que exista una sesión o backend en Hito 1.
 */
export interface CourseCatalogReader {
  listElectiveAreas(): Promise<readonly ElectiveArea[]>;
  listCourses(options?: CourseListOptions): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  getCourseBySlug(slug: string): Promise<Course | undefined>;
}

export interface CourseAdministrationService extends CourseCatalogReader {
  createCourse(input: CourseInput): Promise<Course>;
  updateCourse(id: string, input: CourseInput): Promise<Course>;
  setCourseArchived(id: string, archived: boolean): Promise<Course>;
}

/** Una sugerencia NO es un Course público ni una autorización para crearlo. */
export interface CourseCreationRequest {
  readonly id: string;
  /** Identidad impuesta por sesión del servidor, nunca aceptada del formulario. */
  readonly requestedBy: string;
  readonly proposedCourse: NormalizedCourseInput;
  readonly status: "pending" | "approved" | "rejected";
  readonly submittedAt: string;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly resultingCourseId: string | null;
  readonly reviewNotes: string | null;
}

export interface CourseRequestReviewEvent {
  readonly id: string;
  readonly requestId: string;
  readonly actorId: string;
  readonly action: "approved" | "rejected";
  readonly notes: string | null;
  readonly happenedAt: string;
}

/** Sin adaptador DEMO: no se simulan envíos, identidades ni cola de revisión.
 * submit requiere correo verificado e impone pending/autor en servidor.
 * Lectura limitada al solicitante y revisores mediante RLS. Aprobar y crear el ramo
 * debe ser una transacción única con evento auditable; el usuario nunca elige roles.
 */
export interface CourseCreationRequestService {
  submit(input: CourseInput): Promise<CourseCreationRequest & { readonly status: "pending" }>;
  listOwnRequests(): Promise<CourseCreationRequest[]>;
}

export interface CourseCreationRequestReviewService {
  listPendingRequests(): Promise<CourseCreationRequest[]>;
  review(requestId: string, decision: { readonly action: "approved" | "rejected"; readonly notes: string; readonly approvedCourse?: CourseInput }): Promise<CourseCreationRequest>;
}
