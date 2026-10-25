import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';

const compile = (path) => ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
test('IDs aprobados persistentes no generados en build se resuelven; ausentes no llegan al visor', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  let approved = true;
  const row = { id, category: 'certamen', document_number: 2, academic_year: 2024, academic_term: 2 };
  const file = { url: `/materiales/${id}/archivo`, kind: 'pdf' };
  const modules = {
    react: React, 'react/jsx-runtime': jsx,
    'next/navigation': { notFound: () => { throw Error('not-found'); } },
    '@/components/materials/material-content': { MaterialContent: () => null },
    '@/lib/catalog/data': { getDemoCatalog: () => ({}) },
    '@/lib/catalog/query': { approvedMaterials: () => [{ id: 'demo-sample' }], publicMaterialById: () => null, materialDisplayName: () => 'Certamen 2 - 2024-2' },
    '@/lib/catalog/course-filters': { parseCourseFilters: () => ({ filters: {},errors: [] }) },
    '@/lib/materials/local-source': { materialFileSource: {} }, './loading': { default: () => null },
    '@/lib/materials/persistent': { getApprovedMaterialRow: async (requested) => { assert.equal(requested,id); return approved ? row : null; } },
    '@/lib/materials/stored-source': { storedFileMetadata: () => file },
  };
  const exports = {};
  new Function('require','exports',compile('../src/app/materiales/[id]/page.tsx'))((name) => { assert.ok(name in modules,name); return modules[name]; },exports);
  assert.equal(exports.unstable_paramMatching.id,'blocking');
  assert.ok(!exports.generateStaticParams().some((params) => params.id === id));
  const render = async () => {
    const page = await exports.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
    return page.props.children.type(page.props.children.props);
  };
  assert.equal((await render()).props.file,file);
  approved = false;
  await assert.rejects(render(),/not-found/);
});
test('PDF.js de servidor conserva resolución nativa de su worker', () => {
  const exports = {};
  new Function('exports',compile('../next.config.ts'))(exports);
  assert.ok(exports.default.serverExternalPackages.includes('pdfjs-dist'));
});
test('manifest de producción permite fichas UUID nuevas', { skip: process.env.WIKI_TEST_PRODUCTION_MANIFEST !== 'true' }, () => {
  const manifest = JSON.parse(readFileSync(new URL('../.next/prerender-manifest.json',import.meta.url),'utf8'));
  const route = manifest.dynamicRoutes['/materiales/[id]'];
  assert.ok(route);
  assert.notEqual(route.fallback,false,'static DEMO params must not close the persistent route');
});
