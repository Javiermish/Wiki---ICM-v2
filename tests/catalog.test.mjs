import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { approvedMaterials, catalogFacets, materialDisplayName, searchCatalog } from "../src/lib/catalog/query.ts";
import { catalogHref, parseCatalogFilters } from "../src/lib/catalog/filters.ts";

test("Cálculo I pertenece al semestre curricular 1, aunque Certamen 2 es de 2024-2", () => {
  const [material] = searchCatalog(demoCatalog, { q: "Cálculo I", curricularSemester: 1, year: 2024, term: 2, category: "certamen", number: 2 });
  assert.equal(material.displayName, "Certamen 2 - 2024-2");
  assert.equal(material.course.curricularSemester, 1);
  assert.equal(material.academicPeriod, "2024-2");
  assert.equal(searchCatalog(demoCatalog, { q: "Cálculo I", curricularSemester: 2, year: 2024, term: 2 }).length, 0);
});

test("el nombre público no depende de la fecha de subida ni del nombre original", () => {
  const material = demoCatalog.materials[0];
  const offering = demoCatalog.offerings.find((entry) => entry.id === material.offeringId);
  assert.equal(materialDisplayName({ ...material, originalFilename: "Listado 9 - 2030-1.pdf", submittedAt: "2035-01-01" }, offering), "Certamen 2 - 2024-2");
  assert.equal(materialDisplayName({ ...material, category: "apunte", documentNumber: null }, offering), "Apuntes - 2024-2");
  assert.equal(materialDisplayName({ ...material, category: "apunte", documentNumber: 1 }, offering), "Apuntes 1 - 2024-2");
  assert.equal(materialDisplayName({ ...material, category: "listado", documentNumber: 3 }, { ...offering, academicYear: 2025, academicTerm: 1 }), "Listado 3 - 2025-1");
});

test("la búsqueda es global, sin acentos y por todas las palabras del nombre público", () => {
  assert.equal(searchCatalog(demoCatalog, { q: "  CALCULO   certamen 2 2024-2 " }).length, 2);
  assert.equal(searchCatalog(demoCatalog, { q: "Certamen 2 - 2024-2" })[0].id, "demo-certamen-calculo-2");
  assert.equal(searchCatalog(demoCatalog, { q: "ecuaciones" }).length, 1);
  assert.equal(searchCatalog(demoCatalog, { q: "certámenes" }).length, 4);
  assert.equal(searchCatalog(demoCatalog, { q: "listados" }).length, 2);
  assert.equal(searchCatalog(demoCatalog, { q: "DEMO-C1" }).length, 5);
  assert.equal(searchCatalog(demoCatalog, { q: "sin-coincidencias" }).length, 0);
  assert.equal(searchCatalog(demoCatalog, { q: "   " }).length, approvedMaterials(demoCatalog).length);
});

test("todos los criterios se cumplen sobre la misma edición y el mismo material", () => {
  assert.equal(searchCatalog(demoCatalog, { q: "calculo", year: 2024, category: "listado" }).length, 0);
  assert.equal(searchCatalog(demoCatalog, { q: "calculo", year: 2024, term: 1, number: 2 }).length, 0);
  assert.equal(searchCatalog(demoCatalog, { curricularSemester: 1, category: "apunte", year: 2025, term: 2 }).length, 1);
});

test("pending y rejected no aparecen ni alteran opciones o contadores públicos", () => {
  const privateCatalog = {
    ...demoCatalog,
    courses: [...demoCatalog.courses, { ...demoCatalog.courses[0], id: "privado", curricularSemester: 15 }],
    offerings: [...demoCatalog.offerings, { id: "privada", courseId: "privado", academicYear: 2099, academicTerm: 2 }],
    materials: [...demoCatalog.materials, ...["pending", "rejected"].map((status) => ({ ...demoCatalog.materials[0], id: status, offeringId: "privada", status, title: "texto-no-publico" }))],
  };
  assert.deepEqual(approvedMaterials(privateCatalog), approvedMaterials(demoCatalog));
  assert.deepEqual(catalogFacets(privateCatalog), catalogFacets(demoCatalog));
  assert.equal(searchCatalog(privateCatalog, { q: "texto-no-publico" }).length, 0);
  assert.ok(approvedMaterials(privateCatalog).every((entry) => !("originalFilename" in entry) && !("submittedAt" in entry)));
});

test("las relaciones rotas no producen materiales públicos", () => {
  assert.equal(approvedMaterials({ ...demoCatalog, offerings: [] }).length, 0);
  assert.equal(approvedMaterials({ ...demoCatalog, courses: [] }).length, 0);
});

test("parsea filtros combinados y los conserva al construir accesos de semestre", () => {
  const { filters, errors } = parseCatalogFilters({ q: " calculo ", curricularSemester: "1", category: "certamen", year: "2024", term: "2", number: "2" });
  assert.deepEqual(errors, []);
  assert.equal(searchCatalog(demoCatalog, filters)[0].displayName, "Certamen 2 - 2024-2");
  const url = new URL(catalogHref({ ...filters, curricularSemester: 2 }), "http://localhost");
  assert.equal(url.searchParams.get("q"), "calculo");
  assert.equal(url.searchParams.get("year"), "2024");
  assert.equal(url.searchParams.get("term"), "2");
  assert.equal(url.searchParams.get("number"), "2");
  assert.equal(url.searchParams.get("category"), "certamen");
  assert.equal(url.searchParams.get("curricularSemester"), "2");
});

test("rechaza parámetros repetidos, fuera de rango o enteros parciales", () => {
  for (const params of [{ term: "7" }, { year: "2024abc" }, { category: "otro" }, { number: "0" }, { curricularSemester: "-1" }, { year: "1e3" }, { q: ["uno", "dos"] }, { q: "x".repeat(201) }, { term: ["1", "2"] }]) {
    assert.ok(parseCatalogFilters(params).errors.length > 0, JSON.stringify(params));
  }
  assert.deepEqual(parseCatalogFilters({ q: "  ", year: "", term: undefined }), { filters: {}, errors: [] });
  assert.equal(catalogHref({ q: "álgebra & <b>" }), "/?q=%C3%A1lgebra+%26+%3Cb%3E#materiales");
});
