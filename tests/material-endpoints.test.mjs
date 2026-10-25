import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { boundedFormData, materialHeaders, sameOrigin } from '../src/lib/materials/http.ts';
import { withUploadSlot } from '../src/lib/materials/upload-limits.ts';
import { receiveMaterial } from '../src/lib/materials/upload-service.ts';
import { logMaterialUploadFailure } from '../src/lib/materials/upload-diagnostics.ts';
import { validateContributionDraft, DEFAULT_CONTRIBUTION_MAX_BYTES } from '../src/domain/contribution.ts';
import { fileFormats, normalizedDownloadName } from '../src/lib/materials/file-metadata.ts';
import { materialDisplayName } from '../src/lib/catalog/query.ts';
import { uploadMaterial } from '../src/components/contributions/upload-material.ts';
import { formUploadDraft } from './fixtures/material-upload.mjs';

function load(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require','exports',output)((name) => { assert.ok(name in modules, name); return modules[name]; }, exports);
  return exports;
}
const id = '00000000-0000-4000-8000-000000000001';
const course = { id: formUploadDraft.courseId, status: 'active' };
const draft = { courseId: course.id, category: 'certamen', documentNumber: '2', academicYear: '2024', academicTerm: '2', title: '', section: '', instructor: '', version: '' };
function request({ origin = 'http://localhost', changes = {} } = {}) {
  const body = new FormData();
  body.set('draft',JSON.stringify({ ...draft, uploadedBy: 'attacker', status: 'approved', ...changes }));
  body.set('operationId',id); body.set('authorization','true');
  body.set('file',new File(['test bytes'], 'x.pdf', { type: 'application/pdf' }));
  return new Request('http://localhost/api/materiales', { method: 'POST', body, headers: { origin } });
}

test('cliente privilegiado real envía la clave de servidor, sin sesión ni cookies SSR (sin red)', async () => {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;
  const key = 'eyJ' + Buffer.from('synthetic-service-key').toString('base64url');
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ headers: new Headers(init.headers), cache: init.cache, url: String(input) });
    return Response.json({});
  };
  try {
    const { createMaterialServiceClient } = load('../src/lib/materials/server-config.ts', {
      'server-only': {}, '@supabase/supabase-js': { createClient: createSupabaseClient },
      '@/lib/supabase/config': { getSupabaseConfig: () => ({ url: 'https://example.invalid', key: 'public-not-service' }) },
    });
    const client = createMaterialServiceClient();
    assert.equal((await client.auth.getSession()).data.session, null);
    await client.rpc('finalize_material_upload', { material_id: id, owner_id: id });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].headers.get('apikey') === key);
    assert.ok(requests[0].headers.get('authorization') === `Bearer ${key}`);
    assert.equal(requests[0].headers.has('cookie'), false);
    assert.equal(requests[0].cache, 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('ruta aporte autoriza y aplica cuota antes de leer/validar; identidad impuesta, error R2 recuperable (SDK doble)', async (t) => {
  const events = [];
  let authenticated = false, budget = true, storageFailure = false, reserveFailure = null, finalizeFailure = false, catalogFailure = false;
  const logs = [];
  const originalDiagnostics = process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS;
  process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS = 'true';
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  t.after(() => {
    console.error = originalError;
    if (originalDiagnostics === undefined) delete process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS;
    else process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS = originalDiagnostics;
  });
  const client = { rpc: async (name,args) => {
    events.push([name,args]);
    if (name === 'authorize_material_upload_attempt') return { data: budget };
    if (reserveFailure) return { error: reserveFailure };
    return { data: { id, storage_key: 'private', upload_state: 'uploading', status: 'pending' } };
  } };
  const api = load('../src/app/api/materiales/route.ts', {
    '@/lib/auth/session': { getAccountResult: async () => authenticated ? { status: 'authenticated', account: { id: 'server-owner' } } : { status: 'unauthenticated' } },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/materials/server-config': { createMaterialServiceClient: () => ({ rpc: async (name,args) => { events.push([name,args]); return finalizeFailure ? { error: { code: '42501', message: 'secret credential' } } : { data: {} }; } }) },
    '@/domain/contribution': { validateContributionDraft, DEFAULT_CONTRIBUTION_MAX_BYTES },
    '@/lib/catalog/persistent': { getPublicCatalog: async () => {
      if (catalogFailure) throw new Error('safe catalog error', { cause: { code: 'PGRST205', message: 'private details' } });
      return { courses: [course] };
    } },
    '@/lib/materials/validate-upload': { validateUpload: async (file) => { events.push('validate'); return { data: Buffer.from(await file.arrayBuffer()), bytes: file.size, mimeType: file.type, extension: 'pdf', sha256: 'a'.repeat(64) }; } },
    '@/lib/materials/r2': { isR2Configured: () => true, putR2Object: async () => { events.push('put'); if (storageFailure) throw Error('secret R2 failure'); } },
    '@/lib/materials/upload-service': { receiveMaterial }, '@/lib/materials/http': { boundedFormData, materialHeaders, sameOrigin }, '@/lib/materials/upload-limits': { withUploadSlot },
    '@/lib/materials/upload-diagnostics': { logMaterialUploadFailure },
  });
  assert.equal((await api.POST(request({ origin: 'https://evil.example' }))).status,403);
  assert.equal((await api.POST(request())).status,401);
  assert.equal(events.length,0);
  authenticated = true; budget = false;
  assert.equal((await api.POST(request())).status,429);
  assert.ok(!events.includes('validate'));
  budget = true;
  const result = await api.POST(request());
  assert.equal(result.status,201);
  assert.deepEqual(await result.json(), { id,status: 'pending' });
  const reserve = events.find((event) => event[0] === 'reserve_material_upload')[1];
  assert.ok(!('status' in reserve.metadata));
  assert.ok(!('uploadedBy' in reserve.metadata));
  assert.equal(events.find((event) => event[0] === 'finalize_material_upload')[1].owner_id,'server-owner');
  // Exercise the real browser transport and route, not a hand-built RPC payload.
  const originalXHR = globalThis.XMLHttpRequest;
  const bodies = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    send(body) {
      bodies.push(body);
      this.status = 201;
      this.responseText = JSON.stringify({ id, status: 'pending' });
      this.onload();
    }
  };
  try {
    await uploadMaterial(formUploadDraft, new File(['test bytes'], 'tarea.pdf', { type: 'application/pdf' }), id, () => {});
  } finally {
    if (originalXHR === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = originalXHR;
  }
  assert.deepEqual(JSON.parse(bodies[0].get('draft')), formUploadDraft);
  const formRequest = () => new Request('http://localhost/api/materiales', { method: 'POST', body: bodies[0], headers: { origin: 'http://localhost' } });
  assert.equal((await api.POST(formRequest())).status, 201);
  const formMetadata = events.filter((event) => event[0] === 'reserve_material_upload').at(-1)[1].metadata;
  assert.deepEqual(JSON.parse(JSON.stringify(formMetadata)), {
    courseId: 'demo-calculo-i', category: 'tarea', documentNumber: 2,
    academicYear: 2025, academicTerm: 1, title: null, description: '',
  });
  reserveFailure = { code: '22023', message: 'Invalid upload metadata', details: 'private file' };
  const beforeInvalid = events.length;
  const invalidTask = await api.POST(formRequest());
  assert.equal(invalidTask.status, 400);
  assert.match((await invalidTask.json()).error, /Tareas.*migración/);
  assert.ok(!events.slice(beforeInvalid).includes('put'));
  reserveFailure = { code: '22023', message: 'Upload quota exceeded' };
  assert.equal((await api.POST(formRequest())).status, 429);
  reserveFailure = null;
  const before = events.length;
  storageFailure = true;
  const failure = await api.POST(request());
  assert.equal(failure.status,503);
  assert.ok(!JSON.stringify(await failure.json()).includes('secret'));
  assert.ok(!events.slice(before).some((event) => event[0] === 'finalize_material_upload'));
  assert.equal(logs.at(-1)[1].stage, 'r2_put');
  storageFailure = false; reserveFailure = { code: '22023', message: 'secret metadata', details: 'private file' };
  const beforeReserve = events.length;
  const invalid = await api.POST(request());
  assert.equal(invalid.status, 400);
  assert.ok(!JSON.stringify(await invalid.json()).match(/secret|private file/));
  assert.deepEqual(logs.at(-1), ['[material-upload]', { stage: 'supabase_reserve', code: '22023' }]);
  assert.ok(!events.slice(beforeReserve).includes('put'));
  reserveFailure = null; finalizeFailure = true;
  assert.equal((await api.POST(request())).status, 503);
  assert.deepEqual(logs.at(-1), ['[material-upload]', { stage: 'supabase_finalize', code: '42501' }]);
  finalizeFailure = false; catalogFailure = true;
  assert.equal((await api.POST(request())).status, 503);
  assert.deepEqual(logs.at(-1), ['[material-upload]', { stage: 'catalog', code: 'PGRST205' }]);
  catalogFailure = false;
  assert.ok(!JSON.stringify(logs).match(/secret|private file|server-owner/));
  assert.equal((await api.POST(request({ changes: { academicTerm: '7' } }))).status,400);
});

test('acceso privado exige propietario/revisor antes de leer R2; público comprueba aprobado e integridad (SDK doble)', async () => {
  const data = Buffer.from('actual-file');
  const sha256 = createHash('sha256').update(data).digest('hex');
  const row = { id, course_id: 'course', academic_year: 2024, academic_term: 2, category: 'certamen', document_number: 2, extension: 'pdf', mime_type: 'application/pdf', bytes: data.length, storage_key: 'private-key', sha256, uploaded_by: 'owner', course_offerings: { academic_year: 2024, academic_term: 2 } };
  let account = null, approved = false, reads = 0, corrupt = false;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row }) };
  const api = load('../src/lib/materials/stored-source.ts', {
    'server-only': {}, 'node:crypto': { createHash },
    '@/lib/supabase/server': { createClient: async () => ({ from: () => query }) },
    '@/lib/auth/session': { getAccountResult: async () => account ? { status: 'authenticated', account } : { status: 'unauthenticated' } },
    '@/lib/catalog/query': { materialDisplayName }, './persistent': { getApprovedMaterialRow: async () => approved ? row : null },
    './server-config': { createMaterialServiceClient: () => ({ from: () => query }) },
    './r2': { readR2Object: async () => { reads++; return { data: corrupt ? Buffer.from('corrupt') : data, mimeType: 'application/pdf' }; } },
    './file-metadata': { fileFormats, normalizedDownloadName },
  });
  assert.equal(await api.readStoredMaterialFile(id),null);
  assert.equal(await api.readStoredMaterialFile(id,true),null);
  account = { id: 'stranger', role: 'student' };
  assert.equal(await api.readStoredMaterialFile(id,true),null);
  assert.equal(reads,0);
  account = { id: 'owner', role: 'student' };
  assert.equal((await api.readStoredMaterialFile(id,true)).file.downloadName,'Certamen 2 - 2024-2.pdf');
  account = { id: 'reviewer', role: 'moderator' };
  assert.ok(await api.readStoredMaterialFile(id,true));
  approved = true;
  const resolved = await api.readStoredMaterialFile(id);
  const response = api.materialFileResponse(new Request('http://localhost/archivo?descargar=1'),resolved);
  assert.match(response.headers.get('content-disposition'),/^attachment/);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(await response.text(),'actual-file');
  corrupt = true;
  await assert.rejects(api.readStoredMaterialFile(id),/integridad/);
});

test('limpieza reintentable avanza más allá de100 objetos y no marca cuando R2 falla (SDK doble)', async () => {
  const rows = Array.from({ length: 101 }, (_,index) => ({ id: String(index), storage_key: `key-${index}`, done: false }));
  let failure = false;
  const query = { select: () => query, eq: () => query, is: () => query, order: () => query, limit: async () => ({ data: rows.filter((row) => !row.done).slice(0,100) }) };
  const api = load('../src/app/api/materiales/limpieza/route.ts', {
    '@/lib/auth/session': { getAccountResult: async () => ({ status: 'authenticated', account: { role: 'admin' } }) },
    '@/lib/materials/server-config': { createMaterialServiceClient: () => ({ from: () => query, rpc: async (name,args) => { if (name === 'mark_material_storage_deleted') rows.find((row) => row.id === args.material_id).done = true; return {}; } }) },
    '@/lib/materials/r2': { deleteR2Object: async () => { if (failure) throw Error('storage failure'); } },
    '@/lib/materials/http': { sameOrigin, materialHeaders },
  });
  const req = () => new Request('http://localhost/api/materiales/limpieza', { method: 'POST', headers: { origin: 'http://localhost' } });
  failure = true;
  assert.equal((await api.POST(req())).status,503);
  assert.ok(rows.every((row) => !row.done));
  failure = false;
  assert.equal((await (await api.POST(req())).json()).deleted,100);
  assert.equal((await (await api.POST(req())).json()).deleted,1);
  assert.ok(rows.every((row) => row.done));
});
