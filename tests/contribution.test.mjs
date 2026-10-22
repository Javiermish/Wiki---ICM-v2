import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import {
  checkContributionFile, contributionDisplayName, contributionDownloadName,
  CONTRIBUTION_FILE_ACCEPT, CONTRIBUTION_FILE_GUIDANCE,
  createContributionDraft, DEFAULT_CONTRIBUTION_MAX_BYTES, validateContributionDraft,
} from "../src/domain/contribution.ts";

const course = demoCatalog.courses.find((entry) => entry.slug === "calculo-i");
const draft = (overrides = {}) => ({ ...createContributionDraft(), courseId: course.id, category: "certamen", documentNumber: "2", academicYear: "2024", academicTerm: "2", ...overrides });
const validate = (overrides = {}, courses = demoCatalog.courses) => validateContributionDraft(draft(overrides), courses);
const file = (overrides = {}) => ({ name: "nombre-original-2035.pdf", type: "application/pdf", size: 1024, ...overrides });

test("el borrador vacío es académico, sin identidad, archivos ni fechas inferidas", () => {
  const empty = createContributionDraft();
  assert.ok(Object.values(empty).every((value) => value === ""));
  assert.notEqual(empty, createContributionDraft());
  const result = validateContributionDraft(empty, demoCatalog.courses);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["academicTerm", "academicYear", "category", "courseId"].sort());
  assert.ok(!("value" in result));
});

test("Cálculo I mantiene malla 1 al aportar Certamen 2 de 2024-2", () => {
  const before = JSON.stringify(demoCatalog);
  const result = validate();
  assert.equal(result.ok, true);
  assert.equal(course.curricularSemester, 1);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.academicTerm, 2);
  assert.equal(contributionDisplayName(result.value), "Certamen 2 - 2024-2");
  assert.equal(contributionDownloadName(result.value, "application/pdf"), "Certamen 2 - 2024-2.pdf");
  assert.equal(JSON.stringify(demoCatalog), before);
});

test("recorta strings, convierte números y conserva sección/versión como metadatos secundarios", () => {
  const result = validate({ courseId: ` ${course.id} `, category: " listado ", documentNumber: " 003 ", academicYear: " 2025 ", academicTerm: " 1 ", title: " Ecuaciones ", section: " B ", instructor: " Docente de ejemplo ", version: " Alternativa " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { courseId: course.id, category: "listado", documentNumber: 3, academicYear: 2025, academicTerm: 1, title: "Ecuaciones", section: "B", instructor: "Docente de ejemplo", version: "Alternativa" });
  assert.equal(contributionDisplayName(result.value), "Listado 3 - 2025-1");
});

test("listados y certámenes exigen número; apuntes lo permiten opcional", () => {
  for (const category of ["listado", "certamen"]) {
    for (const documentNumber of ["", " "]) assert.ok(validate({ category, documentNumber }).errors.documentNumber);
  }
  const unnumbered = validate({ category: "apunte", documentNumber: "  " });
  assert.equal(unnumbered.ok, true);
  assert.equal(unnumbered.value.documentNumber, null);
  assert.equal(unnumbered.value.title, null);
  assert.equal(contributionDisplayName(unnumbered.value), "Apuntes - 2024-2");
  const numbered = validate({ category: "apunte", documentNumber: "9" });
  assert.equal(numbered.ok, true);
  assert.equal(contributionDisplayName(numbered.value), "Apuntes 9 - 2024-2");
  assert.ok(validate({ category: "apunte", documentNumber: "0" }).errors.documentNumber);
});

test("errores por campo: curso inexistente, categorías desconocidas y enteros estrictos", () => {
  for (const courseId of ["", "no-existe", "__proto__", "constructor"]) assert.ok(validate({ courseId }).errors.courseId);
  assert.ok(validate({}, []).errors.courseId);
  for (const category of ["otro", "__proto__", "constructor", "CERTAMEN"]) assert.ok(validate({ category }).errors.category);
  for (const [field, invalid] of Object.entries({
    academicYear: ["", "1899", "2101", "2024abc", "2e3", "2024.0", "0x7e8", "Infinity", "-2024", ["2024"]],
    academicTerm: ["", "0", "3", "2abc", "2.0", "1e0", "-1", ["1", "2"]],
    documentNumber: ["0", "1000", "2abc", "2.5", "1e2", "-1", "Infinity", ["2"]],
  })) {
    for (const value of invalid) {
      const result = validate({ [field]: value });
      assert.equal(result.ok, false, `${field}: ${value}`);
      assert.ok(result.errors[field], `${field}: ${value}`);
    }
  }
  for (const academicYear of ["1900", "2100"]) assert.equal(validate({ academicYear }).ok, true);
  for (const documentNumber of ["1", "999"]) assert.equal(validate({ documentNumber }).ok, true);
});

test("título/sección/versión tienen límites, sin convertirse en nombre público", () => {
  for (const [field, max] of [["title", 200], ["section", 80], ["instructor", 120], ["version", 80]]) {
    assert.equal(validate({ [field]: "x".repeat(max) }).ok, true);
    assert.ok(validate({ [field]: "x".repeat(max + 1) }).errors[field]);
  }
  assert.equal(contributionDisplayName(validate({ title: "Listado 77 - 2099-1", section: "B", version: "2" }).value), "Certamen 2 - 2024-2");
});

test("acepta oferta todavía inexistente, ramos vacíos y duplicados/versiones sin unicidad", () => {
  const geometry = demoCatalog.courses.find((entry) => entry.slug === "geometria");
  assert.equal(validate({ courseId: geometry.id, academicYear: "2030", academicTerm: "2" }).ok, true);
  const first = validate();
  assert.deepEqual(validate(), first);
  assert.equal(validate({ section: "2", version: "Alternativa" }).ok, true);
  assert.ok(demoCatalog.materials.filter((entry) => entry.category === "certamen" && entry.documentNumber === 2).length >= 2);
});

test("ignora nombres originales, fechas y datos de identidad/rol/estado ajenos al borrador", () => {
  const result = validate({ originalFilename: "Listado 7 - 2099-1.png", submittedAt: "2050-01-01", email: "no-guardar@example.test", uploadedBy: "persona", role: "admin", status: "approved", curricularSemester: "2" });
  assert.deepEqual(result, validate());
  assert.equal(contributionDownloadName(result.value, "image/jpeg"), "Certamen 2 - 2024-2.jpg");
  assert.ok(!/persona|example|approved|admin|2050/.test(JSON.stringify(result)));
});

test("orientación admite PDF/JPEG/PNG/WebP y el nombre usa extensión canónica por MIME", () => {
  for (const [extension, mimeType, canonical] of [
    ["pdf", "application/pdf", "pdf"], ["jpg", "image/jpeg", "jpg"], ["jpeg", "image/jpeg", "jpg"],
    ["PNG", "image/png", "png"], ["webp", "image/webp", "webp"],
  ]) {
    const result = checkContributionFile(file({ name: `otro.2099-1.${extension}`, type: mimeType }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { mimeType, extension: canonical, bytes: 1024 });
    assert.equal(contributionDownloadName(validate().value, mimeType), `Certamen 2 - 2024-2.${canonical}`);
  }
  assert.equal(contributionDownloadName(validate().value, "image/svg+xml"), null);
  for (const token of [".pdf", ".jpeg", ".png", ".webp"]) assert.ok(CONTRIBUTION_FILE_ACCEPT.includes(token));
});

test("límite predeterminado de 25 MiB configurable, inclusivo, sin tamaños inválidos", () => {
  assert.equal(DEFAULT_CONTRIBUTION_MAX_BYTES, 25 * 1024 * 1024);
  for (const size of [1, DEFAULT_CONTRIBUTION_MAX_BYTES - 1, DEFAULT_CONTRIBUTION_MAX_BYTES]) {
    assert.equal(checkContributionFile(file({ size })).ok, true);
  }
  for (const size of [0, -1, 1.5, NaN, Infinity, DEFAULT_CONTRIBUTION_MAX_BYTES + 1]) assert.equal(checkContributionFile(file({ size })).ok, false);
  assert.equal(checkContributionFile(file({ size: 10 }), { maxBytes: 10 }).ok, true);
  assert.equal(checkContributionFile(file({ size: 11 }), { maxBytes: 10 }).ok, false);
  for (const maxBytes of [0, -1, 0.5, NaN, Infinity]) assert.throws(() => checkContributionFile(file(), { maxBytes }), RangeError);
});

test("orientación rechaza ausencia/tipos/extensiones inconsistentes sin leer contenido", () => {
  assert.ok(checkContributionFile(null).errors.file);
  for (const overrides of [
    { type: "" }, { type: "image/svg+xml", name: "vector.svg" }, { type: "application/octet-stream" },
    { type: "text/plain" }, { type: "text/html", name: "documento.html" },
    { type: "application/x-executable", name: "documento.exe" },
    { name: "documento.svg" }, { name: "documento.html" },
    { name: "documento" }, { name: "documento.pdf.exe" }, { name: "documento.png" },
  ]) assert.equal(checkContributionFile(file(overrides)).ok, false, JSON.stringify(overrides));
  const declaredOnly = file({ arrayBuffer() { throw new Error("No se deben leer bytes"); } });
  assert.equal(checkContributionFile(declaredOnly).ok, true);
  assert.match(CONTRIBUTION_FILE_GUIDANCE, /orientativa/);
  assert.match(CONTRIBUTION_FILE_GUIDANCE, /no verifica el contenido ni garantiza seguridad/);
  assert.match(CONTRIBUTION_FILE_GUIDANCE, /No se sube/);
});
