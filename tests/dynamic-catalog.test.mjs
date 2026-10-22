import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { toPublicCatalog } from "../src/lib/catalog/public-catalog.ts";
import { createDemoCourseRepository } from "../src/lib/catalog/repository.ts";
import { catalogFacets, catalogSemesters, courseClassification, courseMaterials, courseParentBreadcrumb, publicMaterialById, searchCourses, semesterCourses } from "../src/lib/catalog/query.ts";
import { createContributionDraft, validateContributionDraft } from "../src/domain/contribution.ts";

const electiveInput = { name: "Análisis estocástico nuevo", code: "", kind: "elective", curricularSemester: "", electiveAreaId: "estadistica", description: "Ejemplo dinámico" };

test("la proyección pública efectiva omite filas, campos y ofertas privadas", () => {
  const publicCatalog = toPublicCatalog(demoCatalog);
  assert.equal(publicCatalog.materials.length, demoCatalog.materials.filter((material) => material.status === "approved").length);
  const json = JSON.stringify(publicCatalog);
  for (const marker of ["originalFilename", "submittedAt", "MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "demo-calculo-2099-2"]) assert.ok(!json.includes(marker), marker);
  assert.ok(publicCatalog.materials.every((material) => material.status === "approved"));
  assert.deepEqual(toPublicCatalog(publicCatalog), publicCatalog);
});

test("un electivo sin documentos entra en buscador, áreas y aportes desde la misma fuente", () => {
  const repository = createDemoCourseRepository(toPublicCatalog(demoCatalog), () => "nuevo-electivo");
  const course = repository.createCourse(electiveInput);
  const catalog = repository.getCatalog();
  assert.equal(course.curricularSemester, null);
  assert.deepEqual(searchCourses(catalog, { q: "ANALISIS estocastico nuevo" }), [course]);
  assert.ok(searchCourses(catalog, { electiveAreaId: "estadistica" }).some((entry) => entry.id === course.id));
  const draft = { ...createContributionDraft(), courseId: course.id, category: "apunte", academicYear: "2025", academicTerm: "2" };
  assert.equal(validateContributionDraft(draft, searchCourses(catalog)).ok, true);
  for (const category of ["listado", "apunte", "certamen"]) assert.deepEqual(courseMaterials(catalog, course.id, { category }), []);
  assert.equal(courseClassification(course, catalog.electiveAreas), "Electivo · Estadística");
  assert.equal(courseParentBreadcrumb(course, catalog.electiveAreas).href, "/electivos?area=estadistica");
  assert.ok(!catalogFacets(catalog).curricularSemesters.includes(null));
});

test("renombrar/reclasificar/archivar mantiene resolución por IDs usados por lector y favoritos", () => {
  const repository = createDemoCourseRepository(toPublicCatalog(demoCatalog));
  const id = "demo-calculo-i";
  const before = courseMaterials(repository.getCatalog(), id);
  const favoriteIds = before.map((material) => material.id);
  repository.updateCourse(id, { ...electiveInput, name: "Cálculo reclasificado", electiveAreaId: "numerico" });
  repository.setCourseArchived(id, true);
  const catalog = repository.getCatalog();
  assert.equal(catalog.courses.find((course) => course.id === id).slug, "calculo-i");
  assert.deepEqual(courseMaterials(catalog, id).map((material) => material.id), favoriteIds);
  for (const materialId of favoriteIds) {
    const material = publicMaterialById(catalog, materialId);
    assert.equal(material.course.id, id);
    assert.equal(material.course.name, "Cálculo reclasificado");
    assert.equal(material.course.electiveAreaId, "numerico");
    assert.equal(material.course.status, "archived");
  }
  assert.ok(!searchCourses(catalog).some((course) => course.id === id));
  const draft = { ...createContributionDraft(), courseId: id, category: "apunte", academicYear: "2025", academicTerm: "1" };
  assert.equal(validateContributionDraft(draft, catalog.courses).ok, false);
  repository.setCourseArchived(id, false);
  assert.equal(validateContributionDraft(draft, searchCourses(repository.getCatalog())).ok, true);
});

test("un regular en semestre nuevo se incorpora a exploración sin editar componentes", () => {
  const repository = createDemoCourseRepository(toPublicCatalog(demoCatalog), () => "nuevo-regular");
  const course = repository.createCourse({ ...electiveInput, name: "Taller regular dinámico", kind: "regular", curricularSemester: "12", electiveAreaId: "" });
  assert.ok(catalogSemesters(repository.getCatalog()).includes(12));
  assert.deepEqual(semesterCourses(repository.getCatalog(), 12), [course]);
});
