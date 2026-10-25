import assert from 'node:assert/strict';
import test from 'node:test';
import { startCatalogFixture } from './fixtures/catalog-server.mjs';

test('fixture REST loopback: filtros, ausencia, caída y rechazo de escrituras', async () => {
  const fixture = await startCatalogFixture();
  try {
    const get = path => fetch(`${fixture.url}${path}`);
    const rows = await (await get('/rest/v1/courses?slug=eq.calculo-i&select=id,slug')).json();
    assert.deepEqual(rows, [{ id: 'demo-calculo-i', slug: 'calculo-i' }]);
    assert.deepEqual(await (await get('/rest/v1/public_materials')).json(), []);
    assert.equal((await fetch(`${fixture.url}/rest/v1/courses`, { method: 'POST' })).status, 405);
    assert.equal((await get('/rest/v1/materials')).status, 404);
    fixture.setUnavailable(true);
    assert.equal((await get('/rest/v1/courses')).status, 503);
  } finally { await fixture.close(); }
});
