/** Proyección del dominio para el prototipo; no es autorización ni esquema SQL. */
export type AcademicTerm = 1 | 2;
export type MaterialCategory = "listado" | "apunte" | "certamen";
export type ModerationStatus = "pending" | "approved" | "rejected";
/** Categorías disponibles aun cuando un ramo todavía no tiene documentos. */
export const materialCategories = ["listado", "apunte", "certamen"] as const;

export interface ElectiveArea {
  readonly id: string;
  readonly name: string;
}

interface CourseBase {
  readonly version?: number;
  readonly id: string;
  readonly code: string | null;
  readonly slug: string;
  readonly name: string;
  readonly curriculumId: string;
  readonly description: string | null;
  readonly status: "active" | "archived";
}

/** La ubicación curricular nunca determina el período de una oferta académica. */
export type Course = CourseBase & (
  | { readonly kind: "regular"; readonly curricularSemester: number; readonly electiveAreaId: null }
  | { readonly kind: "elective"; readonly curricularSemester: null; readonly electiveAreaId: string }
);

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
  /** Solo fixtures internos/privados: OMITIR al serializar el catálogo público. */
  readonly originalFilename?: string;
  readonly submittedAt?: string;
  readonly status: ModerationStatus;
  readonly section?: string;
  readonly version?: string;
}

export type Material = MaterialBase & (
  | { readonly category: "certamen" | "listado"; readonly documentNumber: number }
  | { readonly category: "apunte"; readonly documentNumber: number | null }
);

export interface Catalog {
  readonly electiveAreas: readonly ElectiveArea[];
  readonly courses: readonly Course[];
  readonly offerings: readonly CourseOffering[];
  readonly materials: readonly Material[];
}

/** Semilla serializable estricta: TypeScript rechaza estados/metadatos privados. */
export type PublicCatalogMaterial = Omit<MaterialBase, "status" | "originalFilename" | "submittedAt"> & {
  readonly status: "approved";
  readonly originalFilename?: never;
  readonly submittedAt?: never;
} & (
  | { readonly category: "certamen" | "listado"; readonly documentNumber: number }
  | { readonly category: "apunte"; readonly documentNumber: number | null }
);

export interface PublicCatalog extends Omit<Catalog, "materials"> {
  readonly materials: readonly PublicCatalogMaterial[];
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
