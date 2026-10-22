import type { Catalog } from "../domain/catalog";

/** Datos inventados. Ni códigos ni ubicaciones constituyen la malla UdeC. */
export const demoSemesters = [1, 2, 3, 4] as const;

export const demoCatalog: Catalog = {
  courses: [
    { id: "demo-calculo-i", code: "DEMO-C1", slug: "calculo-i", name: "Cálculo I", curricularSemester: 1, curriculumId: "plan-ilustrativo" },
    { id: "demo-algebra-i", code: "DEMO-A1", slug: "algebra-i", name: "Álgebra I", curricularSemester: 1, curriculumId: "plan-ilustrativo" },
    { id: "demo-fisica-i", code: "DEMO-F1", slug: "fisica-i", name: "Física I", curricularSemester: 2, curriculumId: "plan-ilustrativo" },
    { id: "demo-programacion", code: "DEMO-P1", slug: "programacion", name: "Programación", curricularSemester: 2, curriculumId: "plan-ilustrativo" },
    { id: "demo-ecuaciones", code: "DEMO-ED", slug: "ecuaciones-diferenciales", name: "Ecuaciones Diferenciales", curricularSemester: 3, curriculumId: "plan-ilustrativo" },
    { id: "demo-geometria", code: null, slug: "geometria", name: "Geometría", curricularSemester: 3, curriculumId: "plan-ilustrativo" },
  ],
  offerings: [
    { id: "demo-calculo-2024-1", courseId: "demo-calculo-i", academicYear: 2024, academicTerm: 1 },
    { id: "demo-calculo-2024-2", courseId: "demo-calculo-i", academicYear: 2024, academicTerm: 2 },
    { id: "demo-calculo-2025-1", courseId: "demo-calculo-i", academicYear: 2025, academicTerm: 1 },
    { id: "demo-calculo-2025-2", courseId: "demo-calculo-i", academicYear: 2025, academicTerm: 2 },
    { id: "demo-algebra-2025-1", courseId: "demo-algebra-i", academicYear: 2025, academicTerm: 1 },
    { id: "demo-fisica-2025-2", courseId: "demo-fisica-i", academicYear: 2025, academicTerm: 2 },
    { id: "demo-programacion-2025-1", courseId: "demo-programacion", academicYear: 2025, academicTerm: 1 },
    { id: "demo-ecuaciones-2024-2", courseId: "demo-ecuaciones", academicYear: 2024, academicTerm: 2 },
    { id: "demo-calculo-2099-2", courseId: "demo-calculo-i", academicYear: 2099, academicTerm: 2 },
  ],
  materials: [
    { id: "demo-certamen-calculo-2", offeringId: "demo-calculo-2024-2", category: "certamen", documentNumber: 2, title: "Límites y continuidad", section: "1", version: "A", originalFilename: "archivo-ejemplo.pdf", submittedAt: "2026-10-01T12:00:00Z", status: "approved" },
    { id: "demo-certamen-calculo-2-seccion-2", offeringId: "demo-calculo-2024-2", category: "certamen", documentNumber: 2, title: "Límites y continuidad", section: "2", version: "B", originalFilename: "otra-version.pdf", submittedAt: "2026-10-01T11:00:00Z", status: "approved" },
    { id: "demo-listado-calculo-3", offeringId: "demo-calculo-2025-1", category: "listado", documentNumber: 3, title: "Ejercicios de derivadas", originalFilename: "practica.pdf", submittedAt: "2026-09-30T12:00:00Z", status: "approved" },
    { id: "demo-apuntes-calculo", offeringId: "demo-calculo-2025-2", category: "apunte", documentNumber: null, title: "Ideas clave de integración", originalFilename: "resumen.pdf", submittedAt: "2026-09-29T12:00:00Z", status: "approved" },
    { id: "demo-certamen-calculo-1", offeringId: "demo-calculo-2024-1", category: "certamen", documentNumber: 1, title: "Funciones y números reales", originalFilename: "evaluacion.pdf", submittedAt: "2026-09-28T12:00:00Z", status: "approved" },
    { id: "demo-listado-algebra-1", offeringId: "demo-algebra-2025-1", category: "listado", documentNumber: 1, title: "Conjuntos y relaciones", originalFilename: "ejercicios.pdf", submittedAt: "2026-09-27T12:00:00Z", status: "approved" },
    { id: "demo-certamen-fisica-1", offeringId: "demo-fisica-2025-2", category: "certamen", documentNumber: 1, title: "Introducción a la mecánica", originalFilename: "fisica.pdf", submittedAt: "2026-09-26T12:00:00Z", status: "approved" },
    { id: "demo-apuntes-programacion", offeringId: "demo-programacion-2025-1", category: "apunte", documentNumber: 1, title: "Algoritmos y resolución de problemas", originalFilename: "notas.pdf", submittedAt: "2026-09-25T12:00:00Z", status: "approved" },
    { id: "demo-apuntes-ecuaciones", offeringId: "demo-ecuaciones-2024-2", category: "apunte", documentNumber: null, title: "Ecuaciones de primer orden", originalFilename: "clase.pdf", submittedAt: "2026-09-24T12:00:00Z", status: "approved" },
    { id: "demo-pending-calculo", offeringId: "demo-calculo-2099-2", category: "certamen", documentNumber: 98, title: "MARCADOR_PRIVADO_PENDIENTE", originalFilename: "privado-pendiente.pdf", submittedAt: "2026-10-02T12:00:00Z", status: "pending" },
    { id: "demo-rejected-calculo", offeringId: "demo-calculo-2099-2", category: "apunte", documentNumber: 99, title: "MARCADOR_PRIVADO_RECHAZADO", originalFilename: "privado-rechazado.pdf", submittedAt: "2026-10-02T12:00:00Z", status: "rejected" },
  ],
};
