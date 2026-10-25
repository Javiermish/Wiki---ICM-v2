import test from 'node:test';
import assert from 'node:assert/strict';
import { withUploadSlot } from '../src/lib/materials/upload-limits.ts';
import { boundedFormData, sameOrigin } from '../src/lib/materials/http.ts';
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
test('multipart acotado incluso sin Content-Length; valida mismo origen', async () => {
  const form = new FormData();
  form.set('draft','{}');
  const request = new Request('http://localhost/api/materiales', { method: 'POST', body: form, headers: { origin: 'http://localhost' } });
  assert.equal(sameOrigin(request),true);
  assert.equal((await boundedFormData(request, 4096)).get('draft'),'{}');
  assert.equal(sameOrigin(new Request(request.url, { headers: { origin: 'https://evil.example' } })),false);
  await assert.rejects(boundedFormData(new Request(request.url, { method: 'POST', body: new Uint8Array(100), headers: { 'content-type': 'multipart/form-data; boundary=x' } }), 20), /tamaño/);
  await assert.rejects(boundedFormData(new Request(request.url, { method: 'POST', body: '', headers: { 'content-length': '100', 'content-type': 'multipart/form-data; boundary=x' } }), 20), /tamaño/);
});
test('origen respeta Host que Next conserva y login permite regresar a aportar', () => {
  assert.equal(sameOrigin(new Request('http://localhost:3104/api/materiales', { headers: { host: '127.0.0.1:3104', origin: 'http://127.0.0.1:3104' } })),true);
  assert.equal(sameOrigin(new Request('http://localhost:3104/api/materiales', { headers: { host: '127.0.0.1:3104', origin: 'http://localhost:3104' } })),false);
  assert.equal(safeNext('/aportar'),'/aportar');
  assert.equal(safeNext('//attacker.invalid/aportar'),'/mi-cuenta');
});
