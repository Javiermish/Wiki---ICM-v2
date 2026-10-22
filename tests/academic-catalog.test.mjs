import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { approvedMaterials, courseFacets, courseMaterials, publicMaterialById, semesterCourses } from "../src/lib/catalog/query.ts";
import { courseHref, parseCourseFilters } from "../src/lib/catalog/course-filters.ts";

const calculus = demoCatalog.courses.find((course) => course.slug === "calculo-i");
const paramsFrom = (url) => Object.fromEntries(new URL(url, "http://localhost").searchParams);

test("buscador local por nombre/código, sin acentos y restringido al semestre curricular", () => {
  assert.deepEqual(semesterCourses(demoCatalog, 1, "  CALCULO   I "), [calculus]);
  assert.deepEqual(semesterCourses(demoCatalog, 1, "demo-c1"), [calculus]);
  assert.equal(semesterCourses(demoCatalog, 2, "calculo").length, 0);
  assert.equal(semesterCourses(demoCatalog, 4).length, 0);
  assert.equal(semesterCourses(demoCatalog, 1, "sin-coincidencias").length, 0);
  assert.equal(semesterCourses(demoCatalog, 1).length, 2);
});

test("los ramos sin código ni documentos siguen siendo navegables", () => {
  const geometry = semesterCourses(demoCatalog, 3, "geometria")[0];
  assert.equal(geometry.code, null);
  for (const category of ["listado", "apunte", "certamen"]) {
    assert.equal(courseMaterials(demoCatalog, geometry.id, { category }).length, 0);
    assert.equal(courseFacets(demoCatalog, geometry.id, category).count, 0);
  }
});

test("contrato español de URL conserva filtros simultáneos al compartir y recargar", () => {
  const url = "/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2";
  const parsed = parseCourseFilters(paramsFrom(url));
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.filters, { category: "certamen", year: 2024, term: 2, number: 2 });
  assert.equal(courseHref(calculus.slug, parsed.filters), url);
  assert.deepEqual(parseCourseFilters(paramsFrom(courseHref(calculus.slug, parsed.filters))), parsed);
  const materials = courseMaterials(demoCatalog, calculus.id, parsed.filters);
  assert.equal(materials.length, 2);
  assert.ok(materials.every((material) => material.displayName === "Certamen 2 - 2024-2" && material.course.curricularSemester === 1));
});

test("número y período no son una clave única: secciones/versiones conservan ID propio", () => {
  const materials = courseMaterials(demoCatalog, calculus.id, { category: "certamen", year: 2024, term: 2, number: 2 });
  assert.equal(new Set(materials.map((material) => material.id)).size, 2);
  assert.equal(new Set(materials.map((material) => material.section)).size, 2);
  assert.equal(new Set(materials.map((material) => material.version)).size, 2);
  assert.equal(new Set(demoCatalog.materials.map((material) => material.id)).size, demoCatalog.materials.length);
});

test("cambiar categoría conserva filtros; limpiar conserva solamente categoría y ramo", () => {
  for (const category of ["listado", "apunte", "certamen"]) {
    const changed = parseCourseFilters(paramsFrom(courseHref(calculus.slug, { category, year: 2024, term: 2, number: 2 })));
    assert.deepEqual(changed.filters, { category, year: 2024, term: 2, number: 2 });
    const cleared = parseCourseFilters(paramsFrom(courseHref(calculus.slug, { category })));
    assert.deepEqual(cleared.filters, { category });
    assert.ok(courseMaterials(demoCatalog, calculus.id, cleared.filters).length > 0);
  }
  assert.deepEqual(parseCourseFilters({}), { filters: { category: "listado" }, errors: [] });
  assert.equal(courseMaterials(demoCatalog, calculus.id, { category: "listado", year: 2024, term: 2, number: 2 }).length, 0);
});

test("opciones de filtros proceden del ramo/categoría y no de los filtros activos", () => {
  assert.deepEqual(courseFacets(demoCatalog, calculus.id, "certamen"), { years: [2024], terms: [1, 2], numbers: [1, 2], count: 3 });
  assert.deepEqual(courseFacets(demoCatalog, calculus.id, "apunte"), { years: [2025], terms: [2], numbers: [], count: 1 });
  assert.equal(courseMaterials(demoCatalog, "id-inexistente").length, 0);
});

test("valores desconocidos, repetidos y fuera de rango se controlan sin lanzar errores", () => {
  for (const params of [
    { tipo: "otro" }, { tipo: "__proto__" }, { tipo: "toString" }, { tipo: ["listados", "certamenes"] },
    { anio: "2024abc" }, { anio: "1899" }, { anio: "2101" }, { anio: ["2024", "2025"] },
    { periodo: "3" }, { periodo: "1e0" }, { periodo: ["1", "2"] },
    { numero: "-1" }, { numero: "0" }, { numero: "2.5" }, { numero: "1000" }, { numero: ["1", "2"] },
  ]) assert.ok(parseCourseFilters(params).errors.length > 0, JSON.stringify(params));
  assert.deepEqual(parseCourseFilters({ anio: "", numero: " ", periodo: undefined, tipo: "" }), { filters: { category: "listado" }, errors: [] });
  assert.deepEqual(parseCourseFilters({ tipo: "certamenes", desconocido: "ignorar", curricularSemester: "2", term: "1" }), { filters: { category: "certamen" }, errors: [] });
  assert.equal(courseHref("ramo & /", { curricularSemester: 2, q: "privado" }), "/ramos/ramo%20%26%20%2F");
});

test("pending/rejected no aparecen por ID, texto, conteos ni opciones, aun en el mismo ramo", () => {
  const publicRows = approvedMaterials(demoCatalog);
  const serialized = JSON.stringify(publicRows);
  for (const material of demoCatalog.materials.filter((material) => material.status !== "approved")) {
    assert.equal(publicMaterialById(demoCatalog, material.id), undefined);
    assert.ok(!serialized.includes(material.id));
    assert.ok(!serialized.includes(material.title));
    assert.ok(!serialized.includes(material.originalFilename));
  }
  assert.equal(publicMaterialById(demoCatalog, "id-inexistente"), undefined);
  assert.equal(publicMaterialById(demoCatalog, "demo-certamen-calculo-2").displayName, "Certamen 2 - 2024-2");
  assert.equal(courseMaterials(demoCatalog, calculus.id, { year: 2099 }).length, 0);
  assert.equal(courseMaterials(demoCatalog, calculus.id, { number: 98 }).length, 0);
  assert.equal(courseMaterials(demoCatalog, calculus.id, { q: "MARCADOR_PRIVADO" }).length, 0);
  const attemptedOverride = parseCourseFilters({ status: "pending", id: "demo-pending-calculo" });
  assert.ok(courseMaterials(demoCatalog, calculus.id, attemptedOverride.filters).every((material) => !material.id.includes("pending")));
  assert.deepEqual(courseFacets(demoCatalog, calculus.id), { years: [2025, 2024], terms: [1, 2], numbers: [1, 2, 3], count: 5 });
  assert.ok(publicRows.every((material) => !("originalFilename" in material) && !("status" in material) && !("offeringId" in material)));
});
