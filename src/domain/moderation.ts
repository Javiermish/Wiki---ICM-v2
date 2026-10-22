import type { Catalog, ModerationStatus } from "./catalog";
import { contributionDisplayName, validateContributionDraft, type ContributionDraft, type ContributionFieldErrors, type ContributionMetadata } from "./contribution.ts";
import type { CourseCreationRequest, CourseInput, NormalizedCourseInput } from "./course-management";

export const reportReasons = ["Archivo incorrecto", "Documento ilegible", "Documento duplicado", "Clasificación equivocada", "Problema de derechos o autorización", "Otro motivo"] as const;
export type ReviewDecision = { readonly action: "approved" | "rejected"; readonly notes: string };

export interface ReviewMaterial {
  readonly id: string;
  readonly metadata: ContributionMetadata;
  readonly status: ModerationStatus;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly reviewNotes: string | null;
}

/** null significa ausencia de identidad en DEMO, nunca un usuario autenticado. */
export interface ReviewCourseRequest extends Omit<CourseCreationRequest, "requestedBy" | "submittedAt"> {
  readonly requestedBy: string | null;
  readonly createdAt: string;
}

export interface MaterialReport {
  readonly id: string;
  readonly materialId: string;
  readonly reason: typeof reportReasons[number];
  readonly description: string;
  readonly status: "open" | "resolved";
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolution: string | null;
}

type EventValue = ModerationStatus | MaterialReport["status"] | ContributionMetadata | NormalizedCourseInput | null;
export interface ModerationEvent {
  readonly id: string;
  readonly resourceType: "material" | "course-request" | "report";
  readonly resourceId: string;
  readonly action: "submitted" | "metadata-corrected" | "approved" | "rejected" | "resolved";
  readonly previous: EventValue;
  readonly next: EventValue;
  readonly reason: string | null;
  readonly happenedAt: string;
  readonly actorId: string | null;
}
export type EventContext = Pick<ModerationEvent, "id" | "happenedAt" | "actorId">;

export function reviewNotes(value: unknown, required = false): string | null {
  if (typeof value !== "string" || value.trim().length > 2000 || (required && !value.trim())) {
    throw new RangeError(required ? "Escribe una explicación entre 1 y 2000 caracteres." : "Usa hasta 2000 caracteres para la explicación.");
  }
  return value.trim() || null;
}

export function validateDecision(status: ModerationStatus, decision: ReviewDecision): string | null {
  if (status !== "pending") throw new RangeError("Este recurso ya fue revisado; no se puede decidir otra vez.");
  if (!decision || !["approved", "rejected"].includes(decision.action)) throw new RangeError("Elige aprobar o rechazar.");
  return reviewNotes(decision.notes, decision.action === "rejected");
}

export function moderationMaterialName(material: ReviewMaterial): string {
  return contributionDisplayName(material.metadata);
}

export function reviewMaterial(material: ReviewMaterial, decision: ReviewDecision, context: EventContext): { value: ReviewMaterial; event: ModerationEvent } {
  const notes = validateDecision(material.status, decision);
  return {
    value: { ...material, status: decision.action, reviewedAt: context.happenedAt, reviewNotes: notes },
    event: { ...context, resourceType: "material", resourceId: material.id, action: decision.action, previous: material.status, next: decision.action, reason: notes },
  };
}

export class ModerationMetadataError extends Error {
  readonly errors: ContributionFieldErrors;
  constructor(errors: ContributionFieldErrors) {
    super("Revisa los metadatos del material.");
    this.name = "ModerationMetadataError";
    this.errors = { ...errors };
  }
}

export function metadataDraft(metadata: ContributionMetadata): ContributionDraft {
  return { courseId: metadata.courseId, category: metadata.category, documentNumber: metadata.documentNumber?.toString() ?? "", academicYear: String(metadata.academicYear), academicTerm: String(metadata.academicTerm), title: metadata.title ?? "", section: metadata.section ?? "", instructor: metadata.instructor ?? "", version: metadata.version ?? "" };
}

export function correctMaterialMetadata(material: ReviewMaterial, draft: ContributionDraft, catalog: Catalog, reason: string, context: EventContext): { value: ReviewMaterial; event: ModerationEvent } {
  if (material.status !== "pending") throw new RangeError("Solo se corrigen materiales pendientes en esta demo.");
  const validation = validateContributionDraft(draft, catalog.courses);
  if (!validation.ok) throw new ModerationMetadataError(validation.errors);
  const notes = reviewNotes(reason, true);
  return {
    value: { ...material, metadata: validation.value },
    event: { ...context, resourceType: "material", resourceId: material.id, action: "metadata-corrected", previous: material.metadata, next: validation.value, reason: notes },
  };
}

export interface ReportInput { readonly materialId: string; readonly reason: string; readonly description: string }
export function validateReportInput(input: ReportInput, catalog: Catalog): Pick<MaterialReport, "materialId" | "reason" | "description"> {
  if (!input || !catalog.materials.some((material) => material.id === input.materialId && material.status === "approved" && catalog.offerings.some((offering) => offering.id === material.offeringId && catalog.courses.some((course) => course.id === offering.courseId)))) {
    throw new RangeError("Solo puedes reportar un material disponible en el catálogo público.");
  }
  if (!(reportReasons as readonly string[]).includes(input.reason)) throw new RangeError("Selecciona un motivo de reporte válido.");
  if (typeof input.description !== "string" || input.description.trim().length > 2000) throw new RangeError("Usa hasta 2000 caracteres en la descripción.");
  return { materialId: input.materialId, reason: input.reason as MaterialReport["reason"], description: input.description.trim() };
}

export function resolveReport(report: MaterialReport, explanation: string, context: EventContext): { value: MaterialReport; event: ModerationEvent } {
  if (report.status !== "open") throw new RangeError("Este reporte ya está resuelto.");
  const resolution = reviewNotes(explanation, true)!;
  return {
    value: { ...report, status: "resolved", resolvedAt: context.happenedAt, resolution },
    event: { ...context, resourceType: "report", resourceId: report.id, action: "resolved", previous: "open", next: "resolved", reason: resolution },
  };
}

export function proposalInput(value: NormalizedCourseInput): CourseInput {
  return { name: value.name, code: value.code ?? "", kind: value.kind, curricularSemester: value.curricularSemester?.toString() ?? "", electiveAreaId: value.electiveAreaId ?? "", description: value.description ?? "" };
}

/** Puertos futuros: servidor impone sesión verificada, roles/RLS, actor y fecha;
 * revisiones/eventos atómicos y archivos privados. La demo NO implementa permisos.
 * Aprobar solicitudes en backend deberá crear el ramo transaccionalmente; aquí no.
 */
export interface ModerationService {
  listMaterials(): Promise<ReviewMaterial[]>;
  correctMaterialMetadata(id: string, draft: ContributionDraft, reason: string): Promise<ReviewMaterial>;
  reviewMaterial(id: string, decision: ReviewDecision): Promise<ReviewMaterial>;
  listCourseRequests(): Promise<ReviewCourseRequest[]>;
  submitCourseRequest(input: CourseInput): Promise<ReviewCourseRequest>;
  correctCourseRequest(id: string, input: CourseInput, reason: string): Promise<ReviewCourseRequest>;
  reviewCourseRequest(id: string, decision: ReviewDecision): Promise<ReviewCourseRequest>;
  listReports(): Promise<MaterialReport[]>;
  submitReport(input: ReportInput): Promise<MaterialReport>;
  resolveReport(id: string, explanation: string): Promise<MaterialReport>;
  listEvents(): Promise<ModerationEvent[]>;
}

export interface ModerationSnapshot {
  readonly materials: readonly ReviewMaterial[];
  readonly requests: readonly ReviewCourseRequest[];
  readonly reports: readonly MaterialReport[];
  readonly events: readonly ModerationEvent[];
}
