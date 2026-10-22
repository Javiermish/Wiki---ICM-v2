import type { PublicCatalog } from "../domain/catalog";
import { validateCourseInput } from "../domain/course-management.ts";
import type { ModerationSnapshot, ReviewCourseRequest, ReviewMaterial } from "../domain/moderation";

/** Semillas deliberadamente SINTÉTICAS y públicas de la demo, nunca aportes privados. */
export function createDemoModerationSeed(catalog: PublicCatalog): ModerationSnapshot {
  const createdAt = "2026-01-10T10:00:00.000Z";
  const reviewedAt = "2026-01-11T11:00:00.000Z";
  const course = catalog.courses.find((item) => item.status === "active");
  const materials: ReviewMaterial[] = course ? (["pending", "pending", "approved", "rejected"] as const).map((status, index) => ({
    id: `synthetic-review-material-${index + 1}`,
    metadata: { courseId: course.id, category: "certamen", documentNumber: index + 1, academicYear: 2025, academicTerm: 2, title: "Metadatos sintéticos para practicar revisión", section: "Muestra" },
    status, createdAt, reviewedAt: status === "pending" ? null : reviewedAt,
    reviewNotes: status === "rejected" ? "Ejemplo ficticio: faltan antecedentes de autorización." : status === "approved" ? "Revisión ficticia de ejemplo; no publicó ningún archivo." : null,
  })) : [];
  const requests: ReviewCourseRequest[] = (["pending", "pending", "approved", "rejected"] as const).flatMap((status, index) => {
    const validation = validateCourseInput({ name: `Ramo sintético solicitado ${index + 1}`, code: `SINT-${index + 1}`, kind: index % 2 ? "elective" : "regular", curricularSemester: "6", electiveAreaId: catalog.electiveAreas[0]?.id ?? "", description: "Solicitud ficticia, no representa oferta oficial." }, catalog);
    return validation.value ? [{ id: `synthetic-course-request-${index + 1}`, requestedBy: null, proposedCourse: validation.value, status, createdAt, reviewedBy: null, reviewedAt: status === "pending" ? null : reviewedAt, resultingCourseId: null, reviewNotes: status === "rejected" ? "Ejemplo ficticio: solicitud incompleta." : null }] : [];
  });
  const publicMaterial = catalog.materials.find((item) => item.status === "approved");
  const reports = publicMaterial ? [{ id: "synthetic-report-1", materialId: publicMaterial.id, reason: "Clasificación equivocada" as const, description: "Reporte sintético para practicar la revisión; la muestra pública no tiene este problema necesariamente.", status: "open" as const, createdAt, resolvedAt: null, resolution: null }] : [];
  const events: ModerationSnapshot["events"][number][] = [
    ...materials.filter((item) => item.status !== "pending").map((item) => ({ id: `synthetic-event-${item.id}`, resourceType: "material" as const, resourceId: item.id, action: item.status as "approved" | "rejected", previous: "pending" as const, next: item.status, reason: item.reviewNotes, happenedAt: reviewedAt, actorId: null })),
    ...requests.filter((item) => item.status !== "pending").map((item) => ({ id: `synthetic-event-${item.id}`, resourceType: "course-request" as const, resourceId: item.id, action: item.status as "approved" | "rejected", previous: "pending" as const, next: item.status, reason: item.reviewNotes, happenedAt: reviewedAt, actorId: null })),
  ];
  return { materials, requests, reports, events };
}
