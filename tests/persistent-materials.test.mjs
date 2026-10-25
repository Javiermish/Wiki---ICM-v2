import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { attachPersistentMaterials } from '../src/lib/materials/rows.ts';
import { publicMaterialById } from '../src/lib/catalog/query.ts';

const course = { id: 'course', slug: 'course', curriculumId: 'plan', name: 'Cálculo I', code: null, description: null, status: 'active', kind: 'regular', curricularSemester: 1, electiveAreaId: null };
const catalog = { courses: [course], electiveAreas: [], offerings: [], materials: [] };
const row = { id: 'uuid', offering_id: 'offering', course_id: course.id, academic_year: 2024, academic_term: 2, category: 'certamen', document_number: 2, title: 'Límites', description: null, section: 'A', instructor: null, version: null, mime_type: 'application/pdf', bytes: 100, extension: 'pdf', storage_key: 'NEVER_PUBLIC', original_filename: 'NEVER_PUBLIC', uploaded_by: 'NEVER_PUBLIC', submitted_at: 'NEVER_PUBLIC', sha256: 'NEVER_PUBLIC' };
test('material persistente mantiene filtros y nombre académico sin campos privados', () => {
  const result = attachPersistentMaterials(catalog, [row]);
  assert.equal(publicMaterialById(result, row.id).displayName, 'Certamen 2 - 2024-2');
  assert.equal(result.courses[0].curricularSemester, 1);
  assert.ok(!JSON.stringify(result).includes('NEVER_PUBLIC'));
  assert.equal(result.materials[0].status, 'approved');
  assert.equal(attachPersistentMaterials({ ...catalog, courses: [] }, [row]).materials.length, 0);
  assert.throws(() => attachPersistentMaterials(catalog, [{ ...row, document_number: null }]), /inválidos/);
});

function load(file, bindings) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)((name) => { assert.ok(name in bindings, name); return bindings[name]; }, exports);
  return exports;
}

test('lector público consulta solo view allowlist paginada y propaga fallo SQL', async () => {
  const events = [];
  let failure = false;
  const client = { from(table) { events.push(table); const query = {
    select(columns) { events.push(columns); return query; }, order() { return query; },
    async range(start, end) { events.push([start,end]); return failure ? { error: { code: '42P01' } } : { data: [row] }; },
  }; return query; } };
  const api = load('../src/lib/materials/persistent.ts', {
    'server-only': {}, '@supabase/supabase-js': {}, '@/lib/supabase/server': {}, '@/lib/supabase/config': {}, '@/lib/auth/session': {},
  });
  assert.equal((await api.readApprovedMaterialRows(client))[0].id, row.id);
  assert.equal(events[0], 'public_materials');
  assert.ok(!events[1].includes('storage_key'));
  assert.deepEqual(events[2], [0,499]);
  failure = true;
  await assert.rejects(api.readApprovedMaterialRows(client), /PostgreSQL/);
});

test('revisión autoriza antes de RPC y trata doble decisión como conflicto', async () => {
  const events = [];
  let allowed = false;
  let conflict = false;
  const api = load('../src/lib/materials/actions.ts', {
    'next/cache': { revalidatePath: () => events.push('refresh') },
    '@/lib/auth/session': { requireRole: async (roles) => { events.push(roles); if (!allowed) throw Error('forbidden'); } },
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async (name,args) => { events.push([name,args]); return { error: conflict ? { code: '55000' } : null }; } }) },
  });
  const id = '00000000-0000-4000-8000-000000000001';
  await assert.rejects(api.reviewMaterialAction(id,'approved','Revisado'), /forbidden/);
  assert.equal(events.length, 1);
  allowed = true;
  await assert.rejects(api.reviewMaterialAction(id,'approved',''), /observaciones/);
  await api.reviewMaterialAction(id,'approved',' Revisado ');
  assert.deepEqual(events.at(-2), ['review_material', { material_id: id, decision: 'approved', notes: 'Revisado' }]);
  conflict = true;
  await assert.rejects(api.reviewMaterialAction(id,'rejected','No autorizado'), /ya fue resuelto/);
});
