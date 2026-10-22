import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as moderation from "../src/domain/moderation.ts";
import { createDemoModerationRepository } from "../src/lib/moderation/repository.ts";
import { createDemoModerationSeed } from "../src/fixtures/moderation.ts";
import { initialElectiveAreas, CourseValidationError } from "../src/domain/course-management.ts";

const course = { id: "public-course", slug: "public-course", name: "Ramo público sintético", code: null, curriculumId: "demo", description: null, status: "active", kind: "regular", curricularSemester: 1, electiveAreaId: null };
const catalog = { courses: [course], electiveAreas: initialElectiveAreas, offerings: [{ id: "offering", courseId: course.id, academicYear: 2024, academicTerm: 2 }], materials: [{ id: "public-material", offeringId: "offering", category: "certamen", documentNumber: 2, title: null, status: "approved" }] };
const draft = (changes = {}) => ({ courseId: course.id, category: "certamen", documentNumber: "2", academicYear: "2024", academicTerm: "2", title: "", section: "", instructor: "", version: "", ...changes });
const request = (changes = {}) => ({ name: "Ramo solicitado sintético", code: "", kind: "regular", curricularSemester: "8", electiveAreaId: "", description: "", ...changes });
const context = { id: "event-test", happenedAt: "2026-01-01T12:00:00.000Z", actorId: null };
function setup() {
  let current = structuredClone(catalog);
  let id = 0;
  const repo = createDemoModerationRepository(createDemoModerationSeed(current), () => current, { generateId: () => `event-${++id}`, now: () => context.happenedAt });
  return { repo, changeCatalog: (next) => { current = next; } };
}

test("pending solo transita a approved/rejected, con motivo de rechazo y evento estructurado", () => {
  const material = createDemoModerationSeed(catalog).materials[0];
  const before = structuredClone(material);
  const { value, event } = moderation.reviewMaterial(material, { action: "approved", notes: "Revisado" }, context);
  assert.equal(value.status, "approved");
  assert.equal(event.resourceType, "material");
  assert.equal(event.resourceId, material.id);
  assert.equal(event.previous, "pending");
  assert.equal(event.next, "approved");
  assert.equal(event.reason, "Revisado");
  assert.equal(event.actorId, null);
  assert.equal(event.happenedAt, context.happenedAt);
  assert.deepEqual(material, before);
  for (const notes of ["", "   ", null, "X".repeat(2001)]) assert.throws(() => moderation.reviewMaterial(material, { action: "rejected", notes }, context));
  assert.equal(moderation.reviewMaterial(material, { action: "rejected", notes: "  Incompleto  " }, context).value.reviewNotes, "Incompleto");
  for (const action of ["pending", "resolved", null]) assert.throws(() => moderation.reviewMaterial(material, { action, notes: "x" }, context));
  for (const status of ["approved", "rejected"]) assert.throws(() => moderation.reviewMaterial({ ...material, status }, { action: "approved", notes: "" }, context));
});

test("corregir metadatos revalida ramo y período, comparte nombres y conserva estado e identidad", () => {
  const material = createDemoModerationSeed(catalog).materials[0];
  const result = moderation.correctMaterialMetadata(material, draft({ category: "listado", documentNumber: "3", academicYear: "2025", academicTerm: "1" }), catalog, "Corrección sintética", context);
  assert.equal(result.value.id, material.id);
  assert.equal(result.value.status, "pending");
  assert.equal(moderation.moderationMaterialName(result.value), "Listado 3 - 2025-1");
  assert.deepEqual(result.event.previous, material.metadata);
  assert.deepEqual(result.event.next, result.value.metadata);
  for (const invalid of [{ academicTerm: "8" }, { courseId: "unknown" }, { documentNumber: "" }]) assert.throws(() => moderation.correctMaterialMetadata(material, draft(invalid), catalog, "Corrección", context));
  assert.throws(() => moderation.correctMaterialMetadata({ ...material, status: "approved" }, draft(), catalog, "Corrección", context));
});

test("servicio asíncrono revisa una sola vez, snapshots aislados y nunca publica", async () => {
  const { repo } = setup();
  const other = setup().repo;
  const publicBefore = JSON.stringify(catalog);
  const initial = await repo.listMaterials();
  const pending = initial.find((item) => item.status === "pending");
  await repo.reviewMaterial(pending.id, { action: "approved", notes: "" });
  const eventCount = (await repo.listEvents()).length;
  await assert.rejects(repo.reviewMaterial(pending.id, { action: "approved", notes: "" }));
  assert.equal((await repo.listEvents()).length, eventCount);
  assert.equal(initial.find((item) => item.id === pending.id).status, "pending");
  assert.equal((await other.listMaterials()).find((item) => item.id === pending.id).status, "pending");
  assert.equal(JSON.stringify(catalog), publicBefore);
  const exposed = await repo.listMaterials();
  try { exposed[0].metadata.title = "externo"; } catch {}
  assert.notEqual((await repo.listMaterials())[0].metadata.title, "externo");
  await assert.rejects(repo.reviewMaterial("unknown", { action: "rejected", notes: "No" }));
});

test("solicitudes regulares y las cinco áreas usan validador, rechazan duplicados y no crean ramos", async () => {
  const { repo } = setup();
  const regular = await repo.submitCourseRequest(request());
  assert.equal(regular.proposedCourse.curricularSemester, 8);
  assert.equal(regular.requestedBy, null);
  await assert.rejects(repo.submitCourseRequest(request()), CourseValidationError);
  for (const area of initialElectiveAreas) {
    const entry = await repo.submitCourseRequest(request({ name: `Solicitud ${area.name}`, kind: "elective", electiveAreaId: area.id }));
    assert.equal(entry.proposedCourse.curricularSemester, null);
    assert.equal(entry.proposedCourse.electiveAreaId, area.id);
  }
  await assert.rejects(repo.submitCourseRequest(request({ name: course.name })), CourseValidationError);
  await assert.rejects(repo.submitCourseRequest(request({ name: "Otra solicitud", kind: "elective", electiveAreaId: "unknown" })), CourseValidationError);
  const decided = await repo.reviewCourseRequest(regular.id, { action: "approved", notes: "" });
  assert.equal(decided.resultingCourseId, null);
  assert.equal(catalog.courses.length, 1);
  await assert.rejects(repo.reviewCourseRequest(regular.id, { action: "rejected", notes: "" }));
});

test("revisión y corrección de solicitudes consultan catálogo dinámico y reservas de otras solicitudes", async () => {
  const { repo, changeCatalog } = setup();
  const entry = await repo.submitCourseRequest(request());
  await assert.rejects(repo.correctCourseRequest(entry.id, request({ name: course.name }), "Duplicado"), CourseValidationError);
  const corrected = await repo.correctCourseRequest(entry.id, request({ name: "Nombre corregido", kind: "elective", electiveAreaId: "discreta" }), "Reclasificación");
  assert.equal(corrected.proposedCourse.kind, "elective");
  changeCatalog({ ...catalog, courses: [...catalog.courses, { ...course, id: "new-course", name: corrected.proposedCourse.name }] });
  await assert.rejects(repo.reviewCourseRequest(entry.id, { action: "approved", notes: "" }), CourseValidationError);
  await assert.rejects(repo.reviewCourseRequest(entry.id, { action: "rejected", notes: "" }));
  assert.equal((await repo.reviewCourseRequest(entry.id, { action: "rejected", notes: "Duplicado detectado" })).status, "rejected");
});

test("reportes solo referencian materiales públicos aprobados y requieren explicación para resolver", async () => {
  const { repo } = setup();
  const report = await repo.submitReport({ materialId: "public-material", reason: moderation.reportReasons[0], description: " Ejemplo " });
  assert.equal(report.status, "open");
  assert.equal(report.description, "Ejemplo");
  for (const materialId of ["unknown", "synthetic-review-material-1"]) await assert.rejects(repo.submitReport({ materialId, reason: moderation.reportReasons[0], description: "" }));
  for (const reason of ["", "inventado", null]) await assert.rejects(repo.submitReport({ materialId: "public-material", reason, description: "" }));
  await assert.rejects(repo.submitReport({ materialId: "public-material", reason: moderation.reportReasons[0], description: "X".repeat(2001) }));
  for (const notes of ["", "   ", null]) await assert.rejects(repo.resolveReport(report.id, notes));
  const resolved = await repo.resolveReport(report.id, "Se revisó la muestra; no requiere retirar material.");
  assert.equal(resolved.status, "resolved");
  assert.ok(resolved.resolution);
  assert.equal(catalog.materials[0].status, "approved");
  await assert.rejects(repo.resolveReport(report.id, "Reintento"));
  const event = (await repo.listEvents()).find((event) => event.resourceId === report.id && event.next === "resolved");
  assert.equal(event.previous, "open");
  assert.ok(event.reason);
});

test("semillas distintas al catálogo y no importan fixtures privados ni usan persistencia", () => {
  const seed = createDemoModerationSeed(catalog);
  assert.ok(seed.materials.every((item) => !catalog.materials.some((material) => material.id === item.id)));
  for (const file of ["../src/fixtures/moderation.ts", "../src/lib/moderation/repository.ts", "../src/components/moderation/moderation-provider.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /fixtures\/catalog|localStorage|sessionStorage|supabase/i);
  }
});

test("decisiones concurrentes y correcciones inválidas no agregan eventos ni cambian estados parcialmente", async () => {
  const { repo } = setup();
  const pending = (await repo.listMaterials()).find((item) => item.status === "pending");
  const eventsBefore = (await repo.listEvents()).length;
  await assert.rejects(repo.correctMaterialMetadata(pending.id, draft({ academicYear: "no" }), "Corrección"));
  await assert.rejects(repo.correctMaterialMetadata(pending.id, draft(), " "));
  assert.equal((await repo.listEvents()).length, eventsBefore);
  const results = await Promise.allSettled([
    repo.reviewMaterial(pending.id, { action: "approved", notes: "" }),
    repo.reviewMaterial(pending.id, { action: "rejected", notes: "Otro intento" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await repo.listEvents()).length, eventsBefore + 1);
});

test("revalidación de material/reportes lee cambios dinámicos y no filtra privados o relaciones rotas", async () => {
  const { repo, changeCatalog } = setup();
  const pending = (await repo.listMaterials()).find((item) => item.status === "pending");
  changeCatalog({ ...catalog, courses: [{ ...course, status: "archived" }] });
  await assert.rejects(repo.reviewMaterial(pending.id, { action: "approved", notes: "" }));
  assert.equal((await repo.listMaterials()).find((item) => item.id === pending.id).status, "pending");
  for (const broken of [
    { ...catalog, materials: [{ ...catalog.materials[0], status: "pending" }] },
    { ...catalog, offerings: [] },
    { ...catalog, courses: [] },
  ]) {
    changeCatalog(broken);
    await assert.rejects(repo.submitReport({ materialId: "public-material", reason: moderation.reportReasons[0], description: "" }));
  }
});

test("reservas incluyen solicitudes aprobadas pero liberan rechazadas y las coincidencias aproximadas solo advierten", async () => {
  const { repo } = setup();
  const first = await repo.submitCourseRequest(request());
  const corrected = await repo.correctCourseRequest(first.id, request({ code: " QA-123 " }), "Agregar código");
  assert.equal(corrected.proposedCourse.code, "QA-123");
  await repo.reviewCourseRequest(first.id, { action: "approved", notes: "" });
  await assert.rejects(repo.submitCourseRequest(request({ name: "Otra propuesta", code: "qa-123" })), CourseValidationError);
  const approximate = await repo.submitCourseRequest(request({ name: "Ramo solicitado sintético ampliado" }));
  assert.equal(approximate.status, "pending");
  const rejected = await repo.submitCourseRequest(request({ name: "Reserva que se libera" }));
  await repo.reviewCourseRequest(rejected.id, { action: "rejected", notes: "Ejemplo" });
  assert.equal((await repo.submitCourseRequest(request({ name: "Reserva que se libera" }))).status, "pending");
});
