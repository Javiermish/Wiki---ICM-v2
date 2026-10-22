/** Proyección del dominio para el prototipo; no es autorización ni esquema SQL. */
export type AcademicTerm = 1 | 2;
export type MaterialCategory = "listado" | "apunte" | "certamen";
export type ModerationStatus = "pending" | "approved" | "rejected";

export interface Course {
  readonly id: string;
  readonly code: string | null;
  readonly slug: string;
  readonly name: string;
  readonly curricularSemester: number;
  readonly curriculumId: string;
}

export interface CourseOffering {
  readonly id: string;
  readonly courseId: string;
  readonly academicYear: number;
  readonly academicTerm: AcademicTerm;
}

interface MaterialBase {
  readonly id: string;
  readonly offeringId: string;
  readonly title: string | null;
  readonly originalFilename: string;
  readonly submittedAt: string;
  readonly status: ModerationStatus;
  readonly section?: string;
  readonly version?: string;
}

export type Material = MaterialBase & (
  | { readonly category: "certamen" | "listado"; readonly documentNumber: number }
  | { readonly category: "apunte"; readonly documentNumber: number | null }
);

export interface Catalog {
  readonly courses: readonly Course[];
  readonly offerings: readonly CourseOffering[];
  readonly materials: readonly Material[];
}

/** Solo metadatos aprobados para componentes públicos; sin archivo original. */
export interface PublicMaterial {
  readonly id: string;
  readonly course: Course;
  readonly category: MaterialCategory;
  readonly documentNumber: number | null;
  readonly displayName: string;
  readonly description: string | null;
  readonly academicYear: number;
  readonly academicTerm: AcademicTerm;
  readonly academicPeriod: string;
  readonly section?: string;
  readonly version?: string;
}

export interface CatalogFilters {
  readonly q?: string;
  readonly curricularSemester?: number;
  readonly category?: MaterialCategory;
  readonly year?: number;
  readonly term?: AcademicTerm;
  readonly number?: number;
}
