import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { demoCatalog } from '../src/fixtures/catalog.ts';

test('proxy rechaza muestras privadas/desconocidas antes del streaming incluso sin Supabase', async () => {
  const source = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const modules = {
    '@supabase/ssr': { createServerClient: () => { throw new Error('No remote client expected'); } },
    'next/server': { NextResponse: { next: () => new Response(), rewrite: (_url, options) => new Response(null, options) } },
    './lib/supabase/config': { getSupabaseConfig: () => null },
    './lib/catalog/data': { getDemoCatalog: () => demoCatalog },
    './lib/catalog/query': { publicMaterialById: (catalog, id) => catalog.materials.find(m => m.id === id && m.status === 'approved') },
  };
  const exports = {};
  new Function('require', 'exports', output)(name => { assert.ok(modules[name], name); return modules[name]; }, exports);
  for (const [id, status] of [['demo-pending-calculo', 404], ['demo-rejected-calculo', 404], ['demo-rejected-algebra', 404], ['demo-unknown', 404], ['demo-certamen-calculo-2', 200],
    // Malformed ids can never exist; a well-formed UUID still reaches the page (its DB error UI, without Supabase).
    ['no-uuid', 404], ['00000000-0000-4000-8000-00000000000', 404], ['00000000-0000-4000-8000-000000000001', 200]]) {
    const url = `http://localhost/materiales/${id}`;
    assert.equal((await exports.proxy({ url, nextUrl: new URL(url) })).status, status, id);
  }
});

test('proxy con Supabase: material ausente da 404 antes del streaming; un error de DB no se disfraza de ausencia (SDK doble)', async () => {
  const source = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const state = { data: null, error: null };
  const lookups = [];
  const query = { select: () => query, eq: (key, value) => { lookups.push([key, value]); return query; }, maybeSingle: async () => ({ data: state.data, error: state.error }) };
  const modules = {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getClaims: async () => ({}) }, from: (table) => { assert.equal(table, 'public_materials'); return query; } }) },
    'next/server': { NextResponse: { next: () => new Response(), rewrite: (_url, options) => new Response(null, options) } },
    './lib/supabase/config': { getSupabaseConfig: () => ({ url: 'https://example.supabase.co', key: 'public-test' }) },
    './lib/catalog/data': { getDemoCatalog: () => demoCatalog },
    './lib/catalog/query': { publicMaterialById: () => null },
  };
  const exports = {};
  new Function('require', 'exports', output)(name => { assert.ok(modules[name], name); return modules[name]; }, exports);
  const id = '00000000-0000-4000-8000-000000000001';
  const status = async (path) => (await exports.proxy({ url: `http://localhost${path}`, nextUrl: new URL(`http://localhost${path}`) })).status;
  assert.equal(await status(`/materiales/${id}`), 404);
  assert.deepEqual(lookups, [['id', id]]);
  state.data = { id };
  assert.equal(await status(`/materiales/${id}`), 200);
  state.data = null; state.error = { code: 'PGRST205' };
  assert.equal(await status(`/materiales/${id}`), 200, 'DB errors must reach the explicit catalog error UI');
  lookups.length = 0;
  assert.equal(await status('/materiales/no-uuid'), 404);
  assert.deepEqual(lookups, [], 'malformed ids never reach the database');
});
