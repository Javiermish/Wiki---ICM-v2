import assert from "node:assert/strict";
import test from "node:test";
import { courseFromRow, courseToRow, attachExampleMaterials } from "../src/lib/catalog/rows.ts";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { toPublicCatalog } from "../src/lib/catalog/public-catalog.ts";
import { normalizeCourseText, validateCourseInput } from "../src/domain/course-management.ts";

const row = { id: "demo-calculo-i", slug: "calculo-i", curriculum_id: "plan-ilustrativo", name: "Cálculo renombrado", code: null, description: null, kind: "elective", curricular_semester: null, elective_area_id: "numerico", status: "active", version: 3 };

test("clave v1 coincide con SQL para diacríticos básicos y marcas extendidas", () => {
  assert.equal(normalizeCourseText(" CÁLCULO---I "), "calculo i");
  assert.equal(normalizeCourseText("A\u1AB0B"), "a b");
  assert.notEqual(normalizeCourseText("A\u1AB0B"), normalizeCourseText("AB"));
});

test("identidad académica admite alfabeto latino explícito, no conversiones Unicode dependientes del motor", () => {
  const input = { name: "Álgebra – Métodos", code: "", kind: "regular", curricularSemester: "1", electiveAreaId: "", description: "" };
  const empty = { ...demoCatalog, courses: [] };
  assert.ok(validateCourseInput(input, empty).value);
  for (const name of ["ΟΣ", "ος", "A²B", "A\u1AB0B"]) assert.ok(validateCourseInput({ ...input, name }, empty).errors.name, name);
  assert.equal(normalizeCourseText("ÁLGEBRA – Métodos"), "algebra metodos");
});

test("filas persistentes conservan identidad, versión y reclasificación", () => {
  const course = courseFromRow(row);
  assert.equal(course.id, row.id);
  assert.equal(course.slug, row.slug);
  assert.equal(course.version, 3);
  assert.equal(course.curricularSemester, null);
  assert.equal(course.electiveAreaId, "numerico");
  const payload = courseToRow(course);
  assert.equal(payload.name, row.name);
  assert.equal(payload.elective_area_id, "numerico");
  assert.ok(!("id" in payload));
  assert.ok(!("slug" in payload));
  assert.ok(!("status" in payload));
});

test("las muestras aportan solo documentos: jamás ramos ausentes en PostgreSQL", () => {
  const examples = toPublicCatalog(demoCatalog);
  const catalog = attachExampleMaterials([courseFromRow(row)], demoCatalog.electiveAreas, examples);
  assert.equal(catalog.courses.length, 1);
  assert.equal(catalog.courses[0].name, row.name);
  assert.ok(catalog.materials.length > 0);
  assert.ok(catalog.materials.every((material) => material.status === "approved"));
  assert.ok(catalog.offerings.every((offering) => offering.courseId === row.id));
  assert.deepEqual(attachExampleMaterials([], [], examples), { courses: [], electiveAreas: [], materials: [], offerings: [] });
  assert.ok(!JSON.stringify(catalog).includes("MARCADOR_PRIVADO"));
});

test("rechaza clasificaciones corruptas en vez de fabricar un ramo", () => {
  for (const invalid of [
    { ...row, kind: "other" }, { ...row, elective_area_id: null },
    { ...row, kind: "regular", curricular_semester: 1 },
    { ...row, kind: "regular", curricular_semester: 13, elective_area_id: null },
  ]) assert.throws(() => courseFromRow(invalid), /catálogo/i);
});
