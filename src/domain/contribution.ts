import type { AcademicTerm, Course, MaterialCategory } from "./catalog";
import type { PublicMaterialFile } from "./material-file";
import { materialDisplayName } from "../lib/catalog/query.ts";
import { fileFormats, normalizedDownloadName } from "../lib/materials/file-metadata.ts";

/** Estado de formulario en memoria. No contiene cuenta, rol ni fecha de subida. */
export interface ContributionDraft {
  readonly courseId: string;
  readonly category: string;
  readonly documentNumber: string;
  readonly academicYear: string;
  readonly academicTerm: string;
  readonly title: string;
  readonly section: string;
  readonly instructor: string;
  readonly version: string;
}

export function createContributionDraft(): ContributionDraft {
  return { courseId: "", category: "", documentNumber: "", academicYear: "", academicTerm: "", title: "", section: "", instructor: "", version: "" };
}

export type ContributionFieldErrors = Partial<Record<keyof ContributionDraft, string>>;

/** Selección de edición académica; nunca se deriva del semestre de malla. */
export type ContributionMetadata = {
  readonly courseId: string;
  readonly academicYear: number;
  readonly academicTerm: AcademicTerm;
  readonly title: string | null;
  readonly section?: string;
  readonly instructor?: string;
  readonly version?: string;
} & (
  | { readonly category: "listado" | "certamen"; readonly documentNumber: number }
  | { readonly category: "apunte"; readonly documentNumber: number | null }
);

export type ContributionValidation =
  | { readonly ok: true; readonly value: ContributionMetadata; readonly errors: ContributionFieldErrors }
  | { readonly ok: false; readonly errors: ContributionFieldErrors };

const stringValue = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const integerInRange = (value: string, min: number, max: number): number | null => {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
};

/** Validación de UX pura, no autorización. Acepta períodos sin materiales/ofertas previas.
 * No consulta duplicados: un mismo certamen puede tener varias secciones/versiones.
 */
export function validateContributionDraft(draft: ContributionDraft, courses: readonly Course[]): ContributionValidation {
  const errors: ContributionFieldErrors = {};
  const courseId = stringValue(draft.courseId);
  const category = stringValue(draft.category);
  const rawNumber = stringValue(draft.documentNumber);
  const academicYear = integerInRange(stringValue(draft.academicYear), 1900, 2100);
  const academicTerm = integerInRange(stringValue(draft.academicTerm), 1, 2);
  const documentNumber = integerInRange(rawNumber, 1, 999);
  const title = stringValue(draft.title);
  const section = stringValue(draft.section);
  const instructor = stringValue(draft.instructor);
  const version = stringValue(draft.version);

  if (!courses.some((course) => course.id === courseId && course.status === "active")) errors.courseId = "Elige un ramo existente y activo.";
  if (!["listado", "apunte", "certamen"].includes(category)) errors.category = "Elige Listados, Apuntes o Certámenes.";
  if (academicYear === null) errors.academicYear = "Usa un año académico entero entre 1900 y 2100.";
  if (academicTerm === null) errors.academicTerm = "Elige el semestre académico 1 o 2, no el de malla.";
  if ((rawNumber !== "" || category === "listado" || category === "certamen") && documentNumber === null) {
    errors.documentNumber = "Usa un número entero entre 1 y 999.";
  }
  if (title.length > 200) errors.title = "Escribe como máximo 200 caracteres.";
  if (section.length > 80) errors.section = "Escribe como máximo 80 caracteres.";
  if (instructor.length > 120) errors.instructor = "Escribe como máximo 120 caracteres.";
  if (version.length > 80) errors.version = "Escribe como máximo 80 caracteres.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const base = { courseId, academicYear: academicYear!, academicTerm: academicTerm as AcademicTerm, title: title || null,
    ...(section ? { section } : {}), ...(instructor ? { instructor } : {}), ...(version ? { version } : {}) };
  const value: ContributionMetadata = category === "apunte"
    ? { ...base, category, documentNumber }
    : { ...base, category: category as Exclude<MaterialCategory, "apunte">, documentNumber: documentNumber! };
  return { ok: true, value, errors: {} };
}

/** Comparte el normalizador del catálogo sin construir registros de materiales. */
export function contributionDisplayName(metadata: ContributionMetadata): string {
  return materialDisplayName(metadata, metadata);
}

export const DEFAULT_CONTRIBUTION_MAX_BYTES = 25 * 1024 * 1024;
export const CONTRIBUTION_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
export const CONTRIBUTION_FILE_GUIDANCE = "La revisión local de tamaño, tipo declarado y extensión es orientativa; no verifica el contenido ni garantiza seguridad. No se sube ningún archivo en esta demo.";

/** File del navegador satisface esta interfaz sin leer ni conservar sus bytes. */
export interface ContributionFileSelection {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface ContributionFilePolicy {
  readonly maxBytes?: number;
}

export type ContributionFileCheck =
  | { readonly ok: true; readonly value: { readonly mimeType: PublicMaterialFile["mimeType"]; readonly extension: PublicMaterialFile["extension"]; readonly bytes: number }; readonly errors: { readonly file?: string } }
  | { readonly ok: false; readonly errors: { readonly file: string } };

function formatForMime(mimeType: string) {
  return (Object.entries(fileFormats) as [PublicMaterialFile["extension"], (typeof fileFormats)[keyof typeof fileFormats]][])
    .find(([, format]) => format.mimeType === mimeType);
}

/** Orientación de selección exclusivamente: no firmas, escaneo, upload ni aprobación. */
export function checkContributionFile(file: ContributionFileSelection | null, policy: ContributionFilePolicy = {}): ContributionFileCheck {
  const maxBytes = policy.maxBytes ?? DEFAULT_CONTRIBUTION_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("maxBytes debe ser un entero positivo.");
  const fail = (message: string): ContributionFileCheck => ({ ok: false, errors: { file: message } });
  if (!file) return fail("Selecciona un archivo PDF, JPEG, PNG o WebP.");
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return fail("El archivo está vacío o su tamaño no es válido. Elige otro archivo.");
  if (file.size > maxBytes) return fail(`El archivo supera el límite de ${maxBytes / (1024 * 1024)} MiB (${maxBytes} bytes). Elige uno más pequeño.`);
  const format = formatForMime(file.type);
  if (!format) return fail("El tipo declarado debe ser PDF, JPEG, PNG o WebP.");
  const extension = stringValue(file.name).split(".").pop()?.toLowerCase();
  const canonicalExtension = extension === "jpeg" ? "jpg" : extension;
  if (!file.name.includes(".") || canonicalExtension !== format[0]) return fail("La extensión debe coincidir con el tipo declarado (PDF, JPEG, PNG o WebP).");
  return { ok: true, value: { mimeType: format[1].mimeType, extension: format[0], bytes: file.size }, errors: {} };
}

/** Nombre orientativo según MIME declarado, NO según nombre original ni fecha. */
export function contributionDownloadName(metadata: ContributionMetadata, mimeType: string): string | null {
  const format = formatForMime(mimeType);
  return format ? normalizedDownloadName(contributionDisplayName(metadata), format[0]) : null;
}

/** Contratos futuros, SIN implementación ni conexión en Hito 1.
 * El servidor deberá verificar sesión/correo, revalidar metadatos contra el catálogo,
 * resolver la oferta por (courseId, academicYear, academicTerm), verificar bytes y
 * almacenar pending en Storage privado con RLS. El cliente no aporta rol/autor/estado.
 */
export interface ContributionSubmission {
  readonly draft: ContributionDraft;
  readonly sharingAuthorized: true;
  readonly file: ContributionFileSelection & { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface ContributionReceipt {
  readonly id: string;
  readonly status: "pending";
}

export interface ContributionService {
  submit(input: ContributionSubmission): Promise<ContributionReceipt>;
}
