import assert from "node:assert/strict";
import test from "node:test";
import { materialCategories } from "../src/domain/catalog.ts";
import { initialElectiveAreas, CourseValidationError, courseInputLimits, validateCourseInput } from "../src/domain/course-management.ts";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { createDemoCourseRepository } from "../src/lib/catalog/repository.ts";

const input = (overrides = {}) => ({
  name: "Modelación Matemática", code: "", kind: "regular", curricularSemester: "4", electiveAreaId: "", description: "", ...overrides,
});
const elective = (overrides = {}) => input({ kind: "elective", curricularSemester: "", electiveAreaId: "optimizacion", ...overrides });
const fromCourse = (course, overrides = {}) => input({
  name: course.name, code: course.code ?? "", kind: course.kind, curricularSemester: course.curricularSemester?.toString() ?? "",
  electiveAreaId: course.electiveAreaId ?? "", description: course.description ?? "", ...overrides,
});
const makeRepo = () => {
  let nextId = 0;
  return createDemoCourseRepository(demoCatalog, () => `test-course-${++nextId}`);
};

test("fixtures preservan seis regulares y once materiales, con electivos sin semestre ni materiales inventados", () => {
  assert.equal(demoCatalog.courses.filter((course) => course.kind === "regular").length, 6);
  assert.equal(demoCatalog.materials.length, 11);
  assert.equal(demoCatalog.offerings.length, 9);
  assert.deepEqual(demoCatalog.courses.slice(0, 6).map((course) => [course.id, course.slug]), [
    ["demo-calculo-i", "calculo-i"], ["demo-algebra-i", "algebra-i"], ["demo-fisica-i", "fisica-i"],
    ["demo-programacion", "programacion"], ["demo-ecuaciones", "ecuaciones-diferenciales"], ["demo-geometria", "geometria"],
  ]);
  for (const course of demoCatalog.courses.filter((course) => course.kind === "elective")) {
    assert.equal(course.curricularSemester, null);
    assert.ok(demoCatalog.electiveAreas.some((area) => area.id === course.electiveAreaId));
    assert.ok(!demoCatalog.offerings.some((offering) => offering.courseId === course.id));
  }
  assert.deepEqual(initialElectiveAreas.map((area) => area.id), ["numerico", "discreta", "optimizacion", "estadistica", "otro"]);
  assert.deepEqual(materialCategories, ["listado", "apunte", "certamen"]);
});

test("normaliza blancos, Unicode, código opcional y descripción sin aceptar campos de identidad", () => {
  const result = validateCourseInput(input({ name: "  Modelacio\u0301n    Matemática ", code: " demo-mm ", description: "  Descripción\nsegunda línea  ", id: "inyectado", slug: "inyectado", status: "archived", curriculumId: "ajeno" }), demoCatalog);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, { name: "Modelación Matemática", code: "DEMO-MM", description: "Descripción\nsegunda línea", kind: "regular", curricularSemester: 4, electiveAreaId: null });
  assert.equal(validateCourseInput(input(), demoCatalog).value.code, null);
  assert.equal(validateCourseInput(input(), demoCatalog).value.description, null);
});

test("valida semestre curricular entero 1–12 sin inferir período académico", () => {
  for (const semester of ["", "0", "13", "-1", "2.5", "2abc", "1e1", "Infinity", "NaN"]) {
    assert.ok(validateCourseInput(input({ curricularSemester: semester }), demoCatalog).errors.curricularSemester, semester);
  }
  for (const semester of ["1", "12"]) assert.equal(validateCourseInput(input({ curricularSemester: semester }), demoCatalog).value.curricularSemester, Number(semester));
  assert.equal(validateCourseInput(input({ electiveAreaId: "valor-antiguo" }), demoCatalog).value.electiveAreaId, null);
  assert.equal(validateCourseInput(elective({ curricularSemester: "valor-antiguo" }), demoCatalog).value.curricularSemester, null);
});

test("valida discriminantes y áreas existentes incluso con entradas runtime no tipadas", () => {
  for (const kind of ["otro", "", null, undefined, 1, {}, "__proto__"]) assert.ok(validateCourseInput(input({ kind }), demoCatalog).errors.kind);
  for (const area of ["", "desconocida", "__proto__", "toString", null, 2]) assert.ok(validateCourseInput(elective({ electiveAreaId: area }), demoCatalog).errors.electiveAreaId);
  for (const area of initialElectiveAreas) assert.equal(validateCourseInput(elective({ electiveAreaId: area.id }), demoCatalog).value.electiveAreaId, area.id);
  for (const invalid of [null, undefined, "texto", 5]) {
    const result = validateCourseInput(invalid, demoCatalog);
    assert.equal(result.value, undefined);
    assert.ok(Object.keys(result.errors).length > 0);
  }
  for (const field of ["name", "code", "curricularSemester", "electiveAreaId", "description"]) {
    assert.ok(validateCourseInput(input({ [field]: {} }), demoCatalog).errors[field], field);
  }
});

test("límites inclusivos de texto y rechazo de caracteres de control", () => {
  const good = input({ name: "N".repeat(courseInputLimits.name), code: "C".repeat(courseInputLimits.code), description: "D".repeat(courseInputLimits.description) });
  assert.ok(validateCourseInput(good, demoCatalog).value);
  for (const field of ["name", "code", "description"]) {
    assert.ok(validateCourseInput({ ...good, [field]: good[field] + "X" }, demoCatalog).errors[field]);
  }
  assert.ok(validateCourseInput(input({ name: "A" }), demoCatalog).errors.name);
  assert.ok(validateCourseInput(input({ name: "Ramo\u0000hostil" }), demoCatalog).errors.name);
  assert.ok(validateCourseInput(input({ code: "DEMO<script>" }), demoCatalog).errors.code);
  assert.ok(validateCourseInput(input({ description: "Texto\u0000hostil" }), demoCatalog).errors.description);
});

test("código y nombre normalizado duplicados bloquean, con ID excluido al editar", () => {
  const codeResult = validateCourseInput(input({ code: " demo-c1 " }), demoCatalog);
  assert.ok(codeResult.errors.code);
  assert.equal(codeResult.value, undefined);
  assert.equal(codeResult.duplicates[0].id, "demo-calculo-i");
  const nameResult = validateCourseInput(input({ name: "  CALCULO - i " }), demoCatalog);
  assert.ok(nameResult.errors.name);
  assert.equal(nameResult.value, undefined);
  const calculus = demoCatalog.courses[0];
  assert.ok(validateCourseInput(fromCourse(calculus), demoCatalog, calculus.id).value);
  assert.equal(validateCourseInput(fromCourse(calculus), demoCatalog, calculus.id).duplicates.length, 0);
  assert.ok(validateCourseInput(input(), demoCatalog).value); // códigos null no son únicos
});

test("duplicados aproximados son advertencia explícita, no fusión ni bloqueo", () => {
  for (const name of ["Cálculo II", "Geometira"]) {
    const result = validateCourseInput(input({ name }), demoCatalog);
    assert.deepEqual(result.errors, {});
    assert.ok(result.value);
    assert.ok(result.duplicates.length > 0, name);
  }
  const repo = makeRepo();
  const created = repo.createCourse(input({ name: "Cálculo II" }));
  assert.notEqual(created.id, "demo-calculo-i");
  assert.equal(repo.getCourse("demo-calculo-i").name, "Cálculo I");
});

test("creación DEMO usa slug local derivado solo de ID y no crea ofertas/materiales", () => {
  const repo = makeRepo();
  const before = repo.getCatalog();
  const course = repo.createCourse(input());
  assert.equal(course.id, "test-course-1");
  assert.equal(course.slug, "local-test-course-1");
  assert.equal(course.status, "active");
  assert.equal(course.curriculumId, "plan-ilustrativo");
  assert.equal(repo.getCourseBySlug(course.slug), course);
  assert.equal(repo.getCourse(course.id), course);
  assert.equal(repo.getCatalog().courses.length, before.courses.length + 1);
  assert.equal(before.courses.length, demoCatalog.courses.length);
  assert.equal(repo.getCatalog().offerings, before.offerings);
  assert.equal(repo.getCatalog().materials, before.materials);
  assert.equal(repo.getCatalog().electiveAreas, before.electiveAreas);
});

test("ID por defecto UUID y slug apto para shell SSR local", () => {
  const course = createDemoCourseRepository(demoCatalog).createCourse(elective());
  assert.match(course.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(course.slug, /^local-[a-zA-Z0-9-]+$/);
});

test("edición preserva ID, slug, plan y archivo aunque cambie nombre, tipo, semestre o área", () => {
  const repo = makeRepo();
  const old = repo.getCourse("demo-calculo-i");
  const before = repo.getCatalog();
  repo.setCourseArchived(old.id, true);
  const updated = repo.updateCourse(old.id, elective({ name: "Cálculo Experimental", description: "Cambiado", id: "hostil", slug: "hostil", status: "active" }));
  assert.equal(updated.id, old.id);
  assert.equal(updated.slug, old.slug);
  assert.equal(updated.curriculumId, old.curriculumId);
  assert.equal(updated.status, "archived");
  assert.equal(updated.kind, "elective");
  assert.equal(updated.curricularSemester, null);
  assert.equal(updated.electiveAreaId, "optimizacion");
  const regular = repo.updateCourse(old.id, input({ curricularSemester: "12" }));
  assert.equal(regular.kind, "regular");
  assert.equal(regular.curricularSemester, 12);
  assert.equal(regular.electiveAreaId, null);
  assert.deepEqual(repo.getCatalog().materials, before.materials);
  assert.deepEqual(repo.getCatalog().offerings, before.offerings);
  assert.equal(old.name, "Cálculo I");
});

test("archivo reversible oculta de listado por defecto, sin eliminar relaciones ni liberarlo como duplicado", () => {
  const repo = makeRepo();
  const original = repo.getCourse("demo-calculo-i");
  const before = repo.getCatalog();
  const archived = repo.setCourseArchived(original.id, true);
  assert.equal(archived.status, "archived");
  assert.ok(!repo.listCourses().some((course) => course.id === original.id));
  assert.ok(repo.listCourses({ includeArchived: true }).some((course) => course.id === original.id));
  assert.equal(repo.getCourseBySlug(original.slug), archived);
  assert.throws(() => repo.createCourse(fromCourse(original)), CourseValidationError);
  assert.equal(repo.setCourseArchived(original.id, false).status, "active");
  assert.deepEqual(repo.getCatalog().materials, before.materials);
  assert.deepEqual(repo.getCatalog().offerings, before.offerings);
  assert.equal(repo.getCatalog().courses.length, before.courses.length);
});

test("listado combina texto sin acentos/código, estado, tipo, área y semestre curricular", () => {
  const repo = makeRepo();
  assert.equal(repo.listCourses({ q: " CALCULO   demo-c1 " })[0].id, "demo-calculo-i");
  assert.equal(repo.listCourses({ kind: "regular", curricularSemester: 1 }).length, 2);
  assert.equal(repo.listCourses({ kind: "elective", electiveAreaId: "numerico", q: "simulacion" }).length, 1);
  assert.equal(repo.listCourses({ kind: "regular", electiveAreaId: "numerico" }).length, 0);
  assert.equal(repo.listCourses({ kind: "elective", curricularSemester: 1 }).length, 0);
  assert.equal(repo.listCourses({ q: "no-hay-resultados" }).length, 0);
  assert.equal(repo.getCourse("no-existe"), undefined);
  assert.equal(repo.getCourseBySlug("no-existe"), undefined);
});

test("validación fallida entrega errores/duplicados y no cambia el snapshot", () => {
  const repo = makeRepo();
  const before = repo.getCatalog();
  assert.throws(() => repo.createCourse(input({ name: "Cálculo I", code: "DEMO-C1" })), (error) => {
    assert.ok(error instanceof CourseValidationError);
    assert.ok(error.errors.name);
    assert.ok(error.errors.code);
    assert.ok(error.duplicates.some((course) => course.id === "demo-calculo-i"));
    return true;
  });
  assert.throws(() => repo.updateCourse("demo-calculo-i", input({ curricularSemester: "99" })), CourseValidationError);
  assert.equal(repo.getCatalog(), before);
});

test("identidad inválida/colisionada y ramo desconocido fallan sin mutar", () => {
  for (const id of ["", "../escape", "id_con_guion_bajo", "demo-calculo-i", null]) {
    const repo = createDemoCourseRepository(demoCatalog, () => id);
    const before = repo.getCatalog();
    assert.throws(() => repo.createCourse(input()));
    assert.equal(repo.getCatalog(), before);
  }
  const repo = makeRepo();
  const before = repo.getCatalog();
  assert.throws(() => repo.updateCourse("no-existe", input()), RangeError);
  assert.throws(() => repo.setCourseArchived("no-existe", true), RangeError);
  assert.throws(() => repo.setCourseArchived("demo-calculo-i", "false"), TypeError);
  assert.equal(repo.getCatalog(), before);
});

test("snapshots inmutables y repositorios aislados; no cambia fixtures ni almacenamiento global", () => {
  const fixtureBefore = JSON.stringify(demoCatalog);
  const external = structuredClone(demoCatalog);
  const repo = createDemoCourseRepository(external, () => "isolated-course");
  const other = makeRepo();
  const snapshot = repo.getCatalog();
  external.courses[0].name = "Mutación externa";
  external.materials[0].title = "Mutación externa";
  assert.equal(snapshot.courses[0].name, "Cálculo I");
  assert.notEqual(snapshot.materials[0].title, "Mutación externa");
  assert.throws(() => { snapshot.courses[0].name = "Mutación"; }, TypeError);
  assert.throws(() => snapshot.courses.push(snapshot.courses[0]), TypeError);
  assert.throws(() => { snapshot.offerings[0].academicYear = 2030; }, TypeError);
  assert.throws(() => { snapshot.materials[0].status = "approved"; }, TypeError);
  assert.throws(() => { snapshot.electiveAreas[0].name = "Mutación"; }, TypeError);
  const list = repo.listCourses();
  list.pop();
  assert.equal(repo.listCourses().length, snapshot.courses.length);
  repo.createCourse(input());
  assert.equal(other.getCatalog().courses.length, demoCatalog.courses.length);
  assert.equal(snapshot.courses.length, demoCatalog.courses.length);
  assert.equal(JSON.stringify(demoCatalog), fixtureBefore);
});

test("repositorio acepta proyección pública sin metadatos privados y no agrega archivos", () => {
  const publicCatalog = { ...demoCatalog, materials: demoCatalog.materials.filter((material) => material.status === "approved").map((material) => {
    const publicMaterial = { ...material };
    delete publicMaterial.originalFilename;
    delete publicMaterial.submittedAt;
    return publicMaterial;
  }) };
  const repo = createDemoCourseRepository(publicCatalog, () => "public-course");
  repo.createCourse(elective());
  const serialized = JSON.stringify(repo.getCatalog());
  for (const marker of ["originalFilename", "submittedAt", "MARCADOR_PRIVADO", "demo-pending", "demo-rejected"]) assert.ok(!serialized.includes(marker));
  assert.equal(repo.getCatalog().materials.length, 9);
});
