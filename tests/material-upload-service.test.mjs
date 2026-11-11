import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMaterialUpload, confirmMaterialUpload, UploadRejectedError } from '../src/lib/materials/upload-service.ts';

const reservation = { id: 'material', storage_key: 'private-key', upload_state: 'uploading', status: 'pending', sha256: 'hash', bytes: 5, mime_type: 'application/pdf' };

function prepare(overrides = {}) {
  const calls = [];
  const deps = {
    reserve: async () => { calls.push('reserve'); return reservation; },
    sign: async (key) => { calls.push(['sign', key]); return 'https://signed.example/put'; },
    ...overrides,
  };
  return { calls, run: () => prepareMaterialUpload(deps) };
}

function confirm(row = reservation, overrides = {}) {
  const calls = [];
  const deps = {
    read: async (key) => { calls.push(['read', key]); return Buffer.from('bytes'); },
    validate: async () => { calls.push('validate'); return { sha256: 'hash', bytes: 5, mimeType: 'application/pdf' }; },
    discard: async () => { calls.push('discard'); },
    finalize: async (id) => { calls.push(['finalize', id]); },
    ...overrides,
  };
  return { calls, run: () => confirmMaterialUpload(row, deps) };
}

test('reserva entrega una URL firmada para la clave privada, sin confirmar el aporte', async () => {
  const { calls, run } = prepare();
  assert.deepEqual(await run(), { kind: 'upload', id: 'material', uploadUrl: 'https://signed.example/put' });
  assert.deepEqual(calls, ['reserve', ['sign', 'private-key']]);
});
test('respuesta perdida después de confirmar es idempotente y no firma otra subida', async () => {
  const { calls, run } = prepare({ reserve: async () => ({ ...reservation, upload_state: 'ready' }) });
  assert.deepEqual(await run(), { kind: 'received', receipt: { id: 'material', status: 'pending' } });
  assert.deepEqual(calls, []);
});
test('reserva expirada o aporte revisado no firman nada', async () => {
  await assert.rejects(prepare({ reserve: async () => ({ ...reservation, upload_state: 'failed' }) }).run(), /expiró/);
  await assert.rejects(prepare({ reserve: async () => ({ ...reservation, upload_state: 'ready', status: 'rejected' }) }).run(), /revisado/);
});
test('confirmación lee los bytes reales, los valida y recién entonces finaliza', async () => {
  const { calls, run } = confirm();
  assert.deepEqual(await run(), { id: 'material', status: 'pending' });
  assert.deepEqual(calls, [['read', 'private-key'], 'validate', ['finalize', 'material']]);
});
test('archivo aún no recibido no descarta la reserva: se puede reintentar la subida', async () => {
  const { calls, run } = confirm(reservation, { read: async () => { throw Error('NoSuchKey'); } });
  await assert.rejects(run(), /NoSuchKey/);
  assert.deepEqual(calls, []);
});
test('contenido inválido o distinto del declarado se descarta y nunca se finaliza', async () => {
  const invalid = confirm(reservation, { validate: async () => { throw Error('PDF no permitido.'); } });
  await assert.rejects(invalid.run(), (error) => error instanceof UploadRejectedError && /PDF no permitido/.test(error.message));
  assert.deepEqual(invalid.calls, [['read', 'private-key'], 'discard']);
  for (const mismatch of [{ sha256: 'other' }, { bytes: 6 }, { mimeType: 'image/png' }]) {
    const swapped = confirm(reservation, { validate: async () => ({ sha256: 'hash', bytes: 5, mimeType: 'application/pdf', ...mismatch }) });
    await assert.rejects(swapped.run(), UploadRejectedError);
    assert.ok(swapped.calls.includes('discard'));
    assert.ok(!swapped.calls.some((call) => Array.isArray(call) && call[0] === 'finalize'));
  }
});
test('finalización ambigua no descarta bytes que podrían estar confirmados', async () => {
  const { calls, run } = confirm(reservation, { finalize: async () => { throw Error('DB unavailable'); } });
  await assert.rejects(run(), /DB unavailable/);
  assert.ok(!calls.includes('discard'));
});
test('confirmar dos veces es idempotente; revisado o expirado no relee R2', async () => {
  const ready = confirm({ ...reservation, upload_state: 'ready' });
  assert.deepEqual(await ready.run(), { id: 'material', status: 'pending' });
  assert.deepEqual(ready.calls, []);
  for (const [row, message] of [[{ ...reservation, upload_state: 'failed' }, /expiró/], [{ ...reservation, status: 'approved', upload_state: 'ready' }, /revisado/]]) {
    const closed = confirm(row);
    await assert.rejects(closed.run(), message);
    assert.deepEqual(closed.calls, []);
  }
});
