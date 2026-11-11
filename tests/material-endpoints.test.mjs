import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { boundedJson, materialHeaders, sameOrigin } from '../src/lib/materials/http.ts';
import { withUploadSlot } from '../src/lib/materials/upload-limits.ts';
import { prepareMaterialUpload, confirmMaterialUpload, UploadRejectedError } from '../src/lib/materials/upload-service.ts';
import { logMaterialUploadFailure } from '../src/lib/materials/upload-diagnostics.ts';
import { validateContributionDraft } from '../src/domain/contribution.ts';
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
const key = `materials/${id}/${id}.pdf`;
// describeUpload is pure; importing validate-upload.ts directly would pull in sharp/PDF.js.
const validateSource = readFileSync(new URL('../src/lib/materials/validate-upload.ts', import.meta.url), 'utf8').replace(/^import .*?;$/gm, '');
const { describeUpload } = new Function(`${ts.transpileModule(validateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('export ', '')}; return { describeUpload };`)();
function request({ origin = 'http://localhost', changes = {}, file = {}, body = {} } = {}) {
  const payload = {
    draft: { ...draft, uploadedBy: 'attacker', status: 'approved', ...changes },
    operationId: id, authorization: true,
    file: { name: 'x.pdf', type: 'application/pdf', size: 10, sha256: 'a'.repeat(64), ...file },
    ...body,
  };
  return new Request('http://localhost/api/materiales', { method: 'POST', body: JSON.stringify(payload), headers: { origin, 'content-type': 'application/json' } });
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

test('reserva autoriza y aplica cuota antes de leer el cuerpo; identidad impuesta; firma sin recibir bytes (SDK doble)', async (t) => {
  const events = [];
  let authenticated = false, budget = true, signFailure = false, reserveFailure = null, catalogFailure = false, reservedState = 'uploading';
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
    return { data: { id, storage_key: key, upload_state: reservedState, status: 'pending' } };
  } };
  const api = load('../src/app/api/materiales/route.ts', {
    '@/lib/auth/session': { getAccountResult: async () => authenticated ? { status: 'authenticated', account: { id: 'server-owner' } } : { status: 'unauthenticated' } },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/domain/contribution': { validateContributionDraft },
    '@/lib/catalog/persistent': { getPublicCatalog: async () => {
      if (catalogFailure) throw new Error('safe catalog error', { cause: { code: 'PGRST205', message: 'private details' } });
      return { courses: [course] };
    } },
    '@/lib/materials/validate-upload': { describeUpload },
    '@/lib/materials/r2': { isR2Configured: () => true, signR2Upload: async (...args) => { events.push(['sign', ...args]); if (signFailure) throw Error('secret R2 failure'); return 'https://bucket.r2.example/put'; } },
    '@/lib/materials/upload-service': { prepareMaterialUpload }, '@/lib/materials/http': { boundedJson, materialHeaders, sameOrigin },
    '@/lib/materials/upload-diagnostics': { logMaterialUploadFailure },
  });
  assert.equal((await api.POST(request({ origin: 'https://evil.example' }))).status,403);
  assert.equal((await api.POST(request())).status,401);
  assert.equal(events.length,0);
  authenticated = true; budget = false;
  assert.equal((await api.POST(request())).status,429);
  assert.ok(!events.some((event) => event[0] === 'reserve_material_upload'));
  budget = true;
  const result = await api.POST(request());
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(), { id, status: 'uploading', uploadUrl: 'https://bucket.r2.example/put', uploadHeaders: { 'Content-Type': 'application/pdf', 'If-None-Match': '*' } });
  const reserve = events.find((event) => event[0] === 'reserve_material_upload')[1];
  assert.ok(!('status' in reserve.metadata));
  assert.ok(!('uploadedBy' in reserve.metadata));
  assert.deepEqual([reserve.file_mime, reserve.file_bytes, reserve.file_extension, reserve.file_sha256], ['application/pdf', 10, 'pdf', 'a'.repeat(64)]);
  assert.deepEqual(events.at(-1), ['sign', key, 'application/pdf', 10]);
  // A lost response after confirmar: no second signed PUT.
  reservedState = 'ready';
  const before = events.length;
  const again = await api.POST(request());
  assert.equal(again.status, 201);
  assert.deepEqual(await again.json(), { id, status: 'pending' });
  assert.ok(!events.slice(before).some((event) => event[0] === 'sign'));
  reservedState = 'uploading';
  // Exercise the real browser transport and route, not a hand-built RPC payload.
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => { bodies.push(init.body); return Response.json({ id, status: 'pending' }, { status: 201 }); };
  try {
    await uploadMaterial(formUploadDraft, new File(['test bytes'], 'tarea.pdf', { type: 'application/pdf' }), id, () => {});
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(JSON.parse(bodies[0]).draft, formUploadDraft);
  const formRequest = () => new Request('http://localhost/api/materiales', { method: 'POST', body: bodies[0], headers: { origin: 'http://localhost', 'content-type': 'application/json' } });
  assert.equal((await api.POST(formRequest())).status, 200);
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
  assert.ok(!events.slice(beforeInvalid).some((event) => event[0] === 'sign'));
  reserveFailure = { code: '22023', message: 'Upload quota exceeded' };
  assert.equal((await api.POST(formRequest())).status, 429);
  reserveFailure = null; signFailure = true;
  const failure = await api.POST(request());
  assert.equal(failure.status,503);
  assert.ok(!JSON.stringify(await failure.json()).includes('secret'));
  assert.equal(logs.at(-1)[1].stage, 'r2_sign');
  signFailure = false; reserveFailure = { code: '22023', message: 'secret metadata', details: 'private file' };
  const invalid = await api.POST(request());
  assert.equal(invalid.status, 400);
  assert.ok(!JSON.stringify(await invalid.json()).match(/secret|private file/));
  assert.deepEqual(logs.at(-1), ['[material-upload]', { stage: 'supabase_reserve', code: '22023' }]);
  reserveFailure = null; catalogFailure = true;
  assert.equal((await api.POST(request())).status, 503);
  assert.deepEqual(logs.at(-1), ['[material-upload]', { stage: 'catalog', code: 'PGRST205' }]);
  catalogFailure = false;
  assert.ok(!JSON.stringify(logs).match(/secret|private file|server-owner/));
  assert.equal((await api.POST(request({ changes: { academicTerm: '7' } }))).status,400);
  for (const file of [
    { name: 'x.html', type: 'text/html' }, { size: 26 * 1024 * 1024 }, { type: 'image/png' },
    { name: '../x.pdf' }, { sha256: 'nope' }, { size: '10' },
  ]) assert.equal((await api.POST(request({ file }))).status, 400);
  assert.equal((await api.POST(request({ body: { authorization: false } }))).status, 400);
});

test('confirmar valida los bytes reales de R2 del propietario antes de finalizar; rechazo descarta (SDK doble)', async () => {
  const pdf = Buffer.from('%PDF-real');
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  let account = { id: 'owner' }, row, stored, valid = true;
  const events = [];
  const reset = () => {
    row = { id, uploaded_by: 'owner', storage_key: key, sha256, bytes: pdf.length, mime_type: 'application/pdf', upload_state: 'uploading', status: 'pending' };
    stored = pdf; valid = true; events.length = 0;
  };
  reset();
  const names = () => events.map((event) => Array.isArray(event) ? event[0] : event);
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row }) };
  const api = load('../src/app/api/materiales/[id]/confirmar/route.ts', {
    '@/lib/auth/session': { getAccountResult: async () => account ? { status: 'authenticated', account } : { status: 'unauthenticated' } },
    '@/lib/supabase/server': { createClient: async () => ({ from: () => query }) },
    '@/lib/materials/server-config': { createMaterialServiceClient: () => ({ rpc: async (name, args) => { events.push([name, args]); return {}; } }) },
    '@/lib/materials/validate-upload': { validateUpload: async (file) => {
      events.push('validate');
      const data = Buffer.from(await file.arrayBuffer());
      if (!valid) throw new Error('PDF no permitido.');
      return { data, bytes: data.length, mimeType: file.type, extension: 'pdf', sha256: createHash('sha256').update(data).digest('hex') };
    } },
    '@/lib/materials/r2': {
      isR2Configured: () => true,
      readR2Object: async () => { events.push('read'); if (!stored) throw new Error('NoSuchKey'); return { data: stored, mimeType: 'application/pdf' }; },
      deleteR2Object: async () => { events.push('delete'); },
    },
    '@/lib/materials/upload-service': { confirmMaterialUpload, UploadRejectedError },
    '@/lib/materials/http': { materialHeaders, sameOrigin }, '@/lib/materials/upload-limits': { withUploadSlot },
    '@/lib/materials/upload-diagnostics': { logMaterialUploadFailure },
  });
  const confirm = (origin = 'http://localhost', materialId = id) => api.POST(
    new Request(`http://localhost/api/materiales/${materialId}/confirmar`, { method: 'POST', headers: { origin } }),
    { params: Promise.resolve({ id: materialId }) });
  assert.equal((await confirm('https://evil.example')).status, 403);
  account = null;
  assert.equal((await confirm()).status, 401);
  account = { id: 'stranger' };
  assert.equal((await confirm()).status, 404);
  account = { id: 'owner' };
  assert.equal((await confirm('http://localhost', 'not-a-uuid')).status, 404);
  assert.deepEqual(events, []);

  stored = null;
  assert.equal((await confirm()).status, 409);
  assert.ok(!names().includes('fail_material_upload'));

  reset();
  const ok = await confirm();
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), { id, status: 'pending' });
  assert.deepEqual(names(), ['read', 'validate', 'finalize_material_upload']);
  assert.deepEqual(events.at(-1)[1], { material_id: id, owner_id: 'owner' });

  for (const tamper of [() => { valid = false; }, () => { stored = Buffer.from('%PDF-swap'); }]) {
    reset(); tamper();
    const rejected = await confirm();
    assert.equal(rejected.status, 400);
    assert.deepEqual(names().slice(-3), ['fail_material_upload', 'delete', 'mark_material_storage_deleted']);
    assert.ok(!names().includes('finalize_material_upload'));
  }

  reset(); row.upload_state = 'ready';
  assert.equal((await confirm()).status, 201);
  assert.deepEqual(events, []);
  row.status = 'approved';
  assert.equal((await confirm()).status, 409);
});

test('descarga exige propietario/revisor o aprobado antes de firmar; redirige a URL firmada sin leer bytes (SDK doble)', async () => {
  const row = { id, course_id: 'course', academic_year: 2024, academic_term: 2, category: 'certamen', document_number: 2, extension: 'pdf', mime_type: 'application/pdf', bytes: 11, storage_key: key, uploaded_by: 'owner', course_offerings: { academic_year: 2024, academic_term: 2 } };
  let account = null, approved = false;
  const signed = [];
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row }) };
  const api = load('../src/lib/materials/stored-source.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => ({ from: () => query }) },
    '@/lib/auth/session': { getAccountResult: async () => account ? { status: 'authenticated', account } : { status: 'unauthenticated' } },
    '@/lib/catalog/query': { materialDisplayName }, './persistent': { getApprovedMaterialRow: async () => approved ? row : null },
    './server-config': { createMaterialServiceClient: () => ({ from: () => query }) },
    './r2': { signR2Read: async (...args) => { signed.push(args); return 'https://bucket.r2.example/get?sig=1'; } },
    './file-metadata': { fileFormats, normalizedDownloadName },
  });
  assert.equal(await api.resolveStoredMaterialFile(id),null);
  assert.equal(await api.resolveStoredMaterialFile(id,true),null);
  account = { id: 'stranger', role: 'student' };
  assert.equal(await api.resolveStoredMaterialFile(id,true),null);
  assert.equal(signed.length,0);
  account = { id: 'owner', role: 'student' };
  assert.equal((await api.resolveStoredMaterialFile(id,true)).file.downloadName,'Certamen 2 - 2024-2.pdf');
  account = { id: 'reviewer', role: 'moderator' };
  assert.equal((await api.resolveStoredMaterialFile(id,true)).key, key);
  approved = true;
  const resolved = await api.resolveStoredMaterialFile(id);
  const download = await api.storedFileRedirect(new Request('http://localhost/archivo?descargar=1'),resolved);
  assert.equal(download.status, 302);
  assert.equal(download.headers.get('location'), 'https://bucket.r2.example/get?sig=1');
  assert.match(download.headers.get('cache-control'),/no-store/);
  assert.equal(download.headers.get('referrer-policy'),'no-referrer');
  assert.deepEqual(signed.at(-1), [key, 'Certamen 2 - 2024-2.pdf', 'attachment']);
  await api.storedFileRedirect(new Request('http://localhost/archivo'),resolved);
  assert.deepEqual(signed.at(-1), [key, 'Certamen 2 - 2024-2.pdf', 'inline']);
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
