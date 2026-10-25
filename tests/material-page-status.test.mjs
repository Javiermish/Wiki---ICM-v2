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
  for (const [id, status] of [['demo-pending-calculo', 404], ['demo-rejected-calculo', 404], ['demo-rejected-algebra', 404], ['demo-unknown', 404], ['demo-certamen-calculo-2', 200]]) {
    const url = `http://localhost/materiales/${id}`;
    assert.equal((await exports.proxy({ url, nextUrl: new URL(url) })).status, status, id);
  }
});
