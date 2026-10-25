import assert from 'node:assert/strict';
import test from 'node:test';
import { materialCategories } from '../src/domain/catalog.ts';
import { createContributionDraft, validateContributionDraft, contributionDownloadName } from '../src/domain/contribution.ts';
import { demoCatalog } from '../src/fixtures/catalog.ts';
import { attachPersistentMaterials } from '../src/lib/materials/rows.ts';
import { categoryLabels, searchCatalog, courseFacets } from '../src/lib/catalog/query.ts';
import { parseCatalogFilters } from '../src/lib/catalog/filters.ts';
import { courseHref, parseCourseFilters } from '../src/lib/catalog/course-filters.ts';
import { isPublicFavorite } from '../src/domain/favorites.ts';

const course = demoCatalog.courses[0];
const draft = { ...createContributionDraft(), courseId: course.id, category: 'tarea', documentNumber: '2', academicYear: '2025', academicTerm: '1', section: ' A ', instructor: ' Docente ', version: ' B ' };

test('Tareas es la cuarta categoría y normaliza número, período y metadatos secundarios', () => {
  assert.deepEqual(materialCategories, ['listado', 'apunte', 'certamen', 'tarea']);
  assert.equal(categoryLabels.tarea, 'Tareas');
  const result = validateContributionDraft(draft, demoCatalog.courses);
  assert.equal(result.ok, true);
  assert.equal(contributionDownloadName(result.value, 'application/pdf'), 'Tarea 2 - 2025-1.pdf');
  assert.deepEqual([result.value.section, result.value.instructor, result.value.version], ['A', 'Docente', 'B']);
  for (const documentNumber of ['', ' ', '0', '1000', '2.5']) {
    assert.ok(validateContributionDraft({ ...draft, documentNumber }, demoCatalog.courses).errors.documentNumber);
  }
});

test('Tareas conserva filtros compartibles del catálogo y del ramo', () => {
  const filters = { category: 'tarea', year: 2025, term: 1, number: 2 };
  assert.deepEqual(parseCatalogFilters({ category: 'tarea', year: '2025', term: '1', number: '2' }), { filters, errors: [] });
  const url = courseHref(course.slug, filters);
  assert.ok(url.includes('tipo=tareas'));
  assert.deepEqual(parseCourseFilters(Object.fromEntries(new URL(url, 'http://localhost').searchParams)), { filters, errors: [] });
});

test('tareas persistentes se buscan y cuentan sin filtrar campos privados ni cambiar datos anteriores', () => {
  const before = JSON.stringify(demoCatalog);
  const row = { id: 'task', offering_id: 'task-offering', course_id: course.id, academic_year: 2025, academic_term: 1, category: 'tarea', document_number: 2, title: null, section: 'A', version: 'B', original_filename: 'PRIVATE_TASK', storage_key: 'PRIVATE_TASK' };
  const catalog = attachPersistentMaterials(demoCatalog, [row]);
  const result = searchCatalog(catalog, { q: 'Tareas', category: 'tarea', year: 2025, term: 1, number: 2 });
  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, 'Tarea 2 - 2025-1');
  assert.equal(courseFacets(catalog, course.id, 'tarea').count, 1);
  assert.equal(isPublicFavorite(catalog, { kind: 'material', id: 'task' }), true);
  assert.ok(!JSON.stringify(catalog).includes('PRIVATE_TASK'));
  assert.throws(() => attachPersistentMaterials(demoCatalog, [{ ...row, document_number: null }]), /inválidos/);
  const privateCatalog = { ...catalog, materials: catalog.materials.map(m => m.id === 'task' ? { ...m, status: 'pending' } : m) };
  assert.equal(searchCatalog(privateCatalog, { category: 'tarea' }).length, 0);
  assert.equal(isPublicFavorite(privateCatalog, { kind: 'material', id: 'task' }), false);
  assert.equal(JSON.stringify(demoCatalog), before);
});
