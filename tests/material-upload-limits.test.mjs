import test from 'node:test';
import assert from 'node:assert/strict';
import { withUploadSlot } from '../src/lib/materials/upload-limits.ts';
import { boundedJson, sameOrigin } from '../src/lib/materials/http.ts';
import { safeNext } from '../src/domain/auth.ts';

test('admite dos cargas por proceso sin encolar memoria y libera incluso tras fallo', async () => {
  const releases = [];
  const running = [0,1].map(() => withUploadSlot(() => new Promise((resolve) => releases.push(resolve))));
  await assert.rejects(withUploadSlot(async () => 'third'), /ocupado/);
  releases.forEach((release) => release('ok'));
  assert.deepEqual(await Promise.all(running), ['ok','ok']);
  await assert.rejects(withUploadSlot(async () => { throw Error('parser failed'); }), /parser failed/);
  assert.equal(await withUploadSlot(async () => 'free'), 'free');
});
test('JSON acotado incluso sin Content-Length; rechaza multipart; valida mismo origen', async () => {
  const json = { 'content-type': 'application/json' };
  const request = new Request('http://localhost/api/materiales', { method: 'POST', body: JSON.stringify({ draft: {} }), headers: { origin: 'http://localhost', ...json } });
  assert.equal(sameOrigin(request),true);
  assert.deepEqual(await boundedJson(request, 4096), { draft: {} });
  assert.equal(sameOrigin(new Request(request.url, { headers: { origin: 'https://evil.example' } })),false);
  await assert.rejects(boundedJson(new Request(request.url, { method: 'POST', body: new Uint8Array(100), headers: json }), 20), /tamaño/);
  await assert.rejects(boundedJson(new Request(request.url, { method: 'POST', body: '', headers: { 'content-length': '100', ...json } }), 20), /tamaño/);
  const form = new FormData();
  form.set('file', new File(['x'], 'x.pdf'));
  await assert.rejects(boundedJson(new Request(request.url, { method: 'POST', body: form }), 4096), /no válida/);
  await assert.rejects(boundedJson(new Request(request.url, { method: 'POST', body: '{', headers: json }), 4096), SyntaxError);
});
test('origen respeta Host que Next conserva y login permite regresar a aportar', () => {
  assert.equal(sameOrigin(new Request('http://localhost:3104/api/materiales', { headers: { host: '127.0.0.1:3104', origin: 'http://127.0.0.1:3104' } })),true);
  assert.equal(sameOrigin(new Request('http://localhost:3104/api/materiales', { headers: { host: '127.0.0.1:3104', origin: 'http://localhost:3104' } })),false);
  assert.equal(safeNext('/aportar'),'/aportar');
  assert.equal(safeNext('//attacker.invalid/aportar'),'/mi-cuenta');
});
