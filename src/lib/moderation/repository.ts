import type { Catalog, Course, PublicCatalog } from "../../domain/catalog";
import { CourseValidationError, validateCourseInput, type CourseInput } from "../../domain/course-management.ts";
import { correctMaterialMetadata, metadataDraft, proposalInput, resolveReport, reviewMaterial, reviewNotes, validateDecision, validateReportInput, type EventContext, type ModerationEvent, type ModerationService, type ModerationSnapshot } from "../../domain/moderation.ts";

/** Una instancia por provider. No conoce archivos, no escribe en el catálogo público. */
export function createDemoModerationRepository(seed: ModerationSnapshot, getCatalog: () => PublicCatalog, options: { generateId?: () => string; now?: () => string } = {}): ModerationService & { getSnapshot(): ModerationSnapshot } {
  let state = structuredClone(seed);
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const context = (): EventContext => ({ id: generateId(), happenedAt: now(), actorId: null });
  const find = <T extends { readonly id: string }>(items: readonly T[], id: string): T => {
    const value = items.find((item) => item.id === id);
    if (!value) throw new RangeError("El recurso de demostración ya no está disponible.");
    return value;
  };
  const appendEvent = (event: ModerationEvent) => [...state.events, event];
  function validateRequest(input: CourseInput, excludeId?: string) {
    const catalog = getCatalog();
    // También reserva propuestas pendientes/aprobadas, sin agregarlas al catálogo real.
    const reservations: Course[] = state.requests.filter((item) => item.id !== excludeId && item.status !== "rejected").map((item) => ({ ...item.proposedCourse, id: item.id, slug: item.id, curriculumId: "synthetic-request-reservation", status: "active" }));
    const validation = validateCourseInput(input, { ...catalog, courses: [...catalog.courses, ...reservations] } as Catalog);
    if (!validation.value) throw new CourseValidationError(validation);
    return validation.value;
  }
  return {
    getSnapshot: () => structuredClone(state),
    async listMaterials() { return structuredClone([...state.materials]); },
    async listCourseRequests() { return structuredClone([...state.requests]); },
    async listReports() { return structuredClone([...state.reports]); },
    async listEvents() { return structuredClone([...state.events]); },
    async correctMaterialMetadata(id, draft, reason) {
      const result = correctMaterialMetadata(find(state.materials, id), draft, getCatalog(), reason, context());
      state = { ...state, materials: state.materials.map((item) => item.id === id ? result.value : item), events: appendEvent(result.event) };
      return structuredClone(result.value);
    },
    async reviewMaterial(id, decision) {
      const material = find(state.materials, id);
      if (decision?.action === "approved") {
        // Revalidar contra el catálogo dinámico antes de aprobar, no solo al editar.
        correctMaterialMetadata(material, metadataDraft(material.metadata), getCatalog(), "Validación previa", context());
      }
      const result = reviewMaterial(material, decision, context());
      state = { ...state, materials: state.materials.map((item) => item.id === id ? result.value : item), events: appendEvent(result.event) };
      return structuredClone(result.value);
    },
    async submitCourseRequest(input) {
      const proposedCourse = validateRequest(input);
      const ctx = context();
      const value = { id: `demo-request-${generateId()}`, requestedBy: null, proposedCourse, status: "pending" as const, createdAt: ctx.happenedAt, reviewedBy: null, reviewedAt: null, resultingCourseId: null, reviewNotes: null };
      const event: ModerationEvent = { ...ctx, resourceType: "course-request", resourceId: value.id, action: "submitted", previous: null, next: "pending", reason: null };
      state = { ...state, requests: [...state.requests, value], events: appendEvent(event) };
      return structuredClone(value);
    },
    async correctCourseRequest(id, input, reason) {
      const entry = find(state.requests, id);
      if (entry.status !== "pending") throw new RangeError("Solo se corrigen solicitudes pendientes.");
      const notes = reviewNotes(reason, true);
      const proposedCourse = validateRequest(input, id);
      const value = { ...entry, proposedCourse };
      const event: ModerationEvent = { ...context(), resourceType: "course-request", resourceId: id, action: "metadata-corrected", previous: entry.proposedCourse, next: proposedCourse, reason: notes };
      state = { ...state, requests: state.requests.map((item) => item.id === id ? value : item), events: appendEvent(event) };
      return structuredClone(value);
    },
    async reviewCourseRequest(id, decision) {
      const entry = find(state.requests, id);
      const notes = validateDecision(entry.status, decision);
      if (decision.action === "approved") validateRequest(proposalInput(entry.proposedCourse), id);
      const ctx = context();
      const value = { ...entry, status: decision.action, reviewedBy: null, reviewedAt: ctx.happenedAt, reviewNotes: notes, resultingCourseId: null };
      const event: ModerationEvent = { ...ctx, resourceType: "course-request", resourceId: id, action: decision.action, previous: entry.status, next: decision.action, reason: notes };
      state = { ...state, requests: state.requests.map((item) => item.id === id ? value : item), events: appendEvent(event) };
      return structuredClone(value);
    },
    async submitReport(input) {
      const validated = validateReportInput(input, getCatalog());
      const ctx = context();
      const value = { ...validated, id: `demo-report-${generateId()}`, status: "open" as const, createdAt: ctx.happenedAt, resolvedAt: null, resolution: null };
      const event: ModerationEvent = { ...ctx, resourceType: "report", resourceId: value.id, action: "submitted", previous: null, next: "open", reason: validated.reason };
      state = { ...state, reports: [...state.reports, value], events: appendEvent(event) };
      return structuredClone(value);
    },
    async resolveReport(id, explanation) {
      const result = resolveReport(find(state.reports, id), explanation, context());
      state = { ...state, reports: state.reports.map((item) => item.id === id ? result.value : item), events: appendEvent(result.event) };
      return structuredClone(result.value);
    },
  };
}
