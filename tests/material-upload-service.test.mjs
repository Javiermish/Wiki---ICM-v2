import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveMaterial } from '../src/lib/materials/upload-service.ts';

const reservation = { id: 'material', storage_key: 'private-key', upload_state: 'uploading', status: 'pending' };
function setup(overrides = {}) {
  const calls = [];
  const deps = {
    reserve: async () => { calls.push('reserve'); return reservation; },
    put: async () => { calls.push('put'); },
    finalize: async () => { calls.push('finalize'); },
    ...overrides,
  };
  return { calls, run: () => receiveMaterial(deps, { data: Buffer.from('bytes'), mimeType: 'application/pdf', sha256: 'hash' }) };
}
test('subida reserva, almacena privado y confirma antes de recibir aporte', async () => {
  const { calls, run } = setup();
  assert.deepEqual(await run(), { id: 'material', status: 'pending' });
  assert.deepEqual(calls, ['reserve', 'put', 'finalize']);
});
test('fallo R2 no confirma; conserva reserva para reintento', async () => {
  const { calls, run } = setup({ put: async () => { throw Error('R2 unavailable'); } });
  await assert.rejects(run(), /R2 unavailable/);
  assert.deepEqual(calls, ['reserve']);
});
test('finalización ambigua no borra bytes que podrían estar publicados', async () => {
  const { calls, run } = setup({ finalize: async () => { throw Error('DB unavailable'); } });
  await assert.rejects(run(), /DB unavailable/);
  assert.deepEqual(calls, ['reserve', 'put']);
});
test('respuesta perdida después de finalizar es idempotente y no vuelve a subir', async () => {
  const { calls, run } = setup({ reserve: async () => ({ ...reservation, upload_state: 'ready' }) });
  assert.equal((await run()).id, 'material');
  assert.deepEqual(calls, []);
});
test('reserva expirada no puede finalizar ni reutilizar objeto', async () => {
  const { calls, run } = setup({ reserve: async () => ({ ...reservation, upload_state: 'failed' }) });
  await assert.rejects(run(), /expiró/);
  assert.deepEqual(calls, []);
});
test('un aporte ya revisado no se presenta de nuevo como pendiente', async () => {
  const { calls, run } = setup({ reserve: async () => ({ ...reservation, upload_state: 'ready', status: 'rejected' }) });
  await assert.rejects(run(), /revisado/);
  assert.deepEqual(calls, []);
});
