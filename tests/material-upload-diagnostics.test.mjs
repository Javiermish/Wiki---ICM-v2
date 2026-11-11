import test from 'node:test';
import assert from 'node:assert/strict';
import { logMaterialUploadFailure } from '../src/lib/materials/upload-diagnostics.ts';

test('diagnóstico opt-in conserva códigos DB/R2, nunca mensajes ni objetos de error', () => {
  const previous = process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS;
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    delete process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS;
    logMaterialUploadFailure('supabase_reserve', { code: '22023' });
    assert.equal(logs.length, 0);
    process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS = 'true';
    logMaterialUploadFailure('r2_read', new Error('private filename', { cause: {
      name: 'AccessDenied', $metadata: { httpStatusCode: 403 }, message: 'secret token',
    } }));
    assert.deepEqual(logs.pop(), ['[material-upload]', { stage: 'r2_read', code: 'AccessDenied', status: 403 }]);
    logMaterialUploadFailure('supabase_reserve', { code: 'PGRST202', details: 'private data' });
    assert.equal(logs.pop()[1].code, 'PGRST202');
    logMaterialUploadFailure('catalog', { code: 'private-token', name: 'private-filename' });
    assert.deepEqual(logs.pop(), ['[material-upload]', { stage: 'catalog', code: 'UNKNOWN' }]);
    logMaterialUploadFailure('supabase_reserve', { code: '22023', message: 'Invalid upload metadata' });
    assert.deepEqual(logs.pop(), ['[material-upload]', { stage: 'supabase_reserve', code: '22023', reason: 'invalid_upload_metadata' }]);
    const cyclic = { code: '42501' }; cyclic.cause = cyclic;
    logMaterialUploadFailure('supabase_finalize', cyclic);
    assert.equal(logs.pop()[1].code, '42501');
  } finally {
    console.error = original;
    if (previous === undefined) delete process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS;
    else process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS = previous;
  }
});
