/** node --test tests/materials.test.mjs
 * HTTP checks opt in with WIKI_TEST_BASE_URL; never starts a server/build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { demoCatalog } from '../src/fixtures/catalog.ts';
import { demoMaterialFiles } from '../src/fixtures/material-files.ts';
import { fileFormats, hasExpectedSignature, normalizedDownloadName } from '../src/lib/materials/file-metadata.ts';
import { materialHref } from '../src/lib/materials/navigation.ts';
import { courseHref, parseCourseFilters } from '../src/lib/catalog/course-filters.ts';
import { publicMaterialById, courseMaterials } from '../src/lib/catalog/query.ts';

const base = process.env.WIKI_TEST_BASE_URL;
const id = 'demo-certamen-calculo-2';
const asset = filename => new URL(`../public/demo/${filename}`, import.meta.url);
const privateRows = demoCatalog.materials.filter(row => row.status !== 'approved');
const privateMarkers = ['MARCADOR_PRIVADO', 'originalFilename', 'submittedAt', ...privateRows.flatMap(row => [row.id, row.title, row.originalFilename])];
const unavailable = ['demo-listado-algebra-1', 'demo-certamen-calculo-2-seccion-2'];
function noPrivate(body, path = '') {
  // A requested ID can be reflected by Next's not-found router; not a catalog leak.
  for (const marker of privateMarkers.filter(marker => !path.includes(marker))) assert.ok(!body.includes(marker), `${path}: exposed ${marker}`);
}
async function request(path, options = {}) {
  return fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), ...options });
}

test('download names use academic domain, not upload date/original filename', () => {
  const expected = {
    'demo-certamen-calculo-2': 'Certamen 2 - 2024-2.pdf',
    'demo-listado-calculo-3': 'Listado 3 - 2025-1.png',
    'demo-apuntes-calculo': 'Apuntes - 2025-2.webp',
    'demo-certamen-calculo-1': 'Certamen 1 - 2024-1.jpg',
  };
  for (const [materialId, entry] of Object.entries(demoMaterialFiles)) {
    const material = publicMaterialById(demoCatalog, materialId);
    assert.ok(material, `${materialId} is approved`);
    const name = normalizedDownloadName(material.displayName, entry.extension);
    assert.equal(name, expected[materialId]);
    assert.equal(material.course.curricularSemester, 1);
    assert.ok(!name.includes('2026'));
    assert.ok(!name.includes(demoCatalog.materials.find(row => row.id === materialId).originalFilename));
  }
});

test('download name strips header/path metacharacters and bounds length', () => {
  const unsafe = normalizedDownloadName('Certamen\r\nX-Foo: y/\\"<>|?*\0\x7f', 'pdf');
  assert.equal(unsafe, 'CertamenX-Foo y.pdf');
  assert.ok(!/[\x00-\x1f\x7f/\\"<>:|?*]/.test(unsafe));
  assert.equal(normalizedDownloadName('A'.repeat(500), 'webp'), `${'A'.repeat(180)}.webp`);
});

test('real local fixture bytes have matching signatures, formats and safe allowlist', async () => {
  assert.deepEqual(Object.keys(demoMaterialFiles).sort(), [id, 'demo-listado-calculo-3', 'demo-apuntes-calculo', 'demo-certamen-calculo-1'].sort());
  assert.deepEqual(fileFormats, {
    pdf: { kind: 'pdf', mimeType: 'application/pdf' },
    png: { kind: 'image', mimeType: 'image/png' },
    jpg: { kind: 'image', mimeType: 'image/jpeg' },
    webp: { kind: 'image', mimeType: 'image/webp' },
  });
  for (const entry of Object.values(demoMaterialFiles)) {
    assert.match(entry.filename, /^[a-z0-9-]+\.(pdf|png|jpg|webp)$/);
    assert.ok(entry.filename.endsWith(`.${entry.extension}`));
    const bytes = await readFile(asset(entry.filename));
    assert.ok(bytes.length > 0 && bytes.length <= 20 * 1024 * 1024);
    assert.equal(hasExpectedSignature(bytes, entry.extension), true);
    for (const other of Object.keys(fileFormats).filter(ext => ext !== entry.extension)) assert.equal(hasExpectedSignature(bytes, other), false);
  }
  for (const row of privateRows) assert.equal(Object.hasOwn(demoMaterialFiles, row.id), false);
  for (const materialId of unavailable) assert.equal(Object.hasOwn(demoMaterialFiles, materialId), false);
});

test('signature checks reject empty, truncated, wrong, and spoofed WebP data', () => {
  const signatures = {
    pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpg: [0xff, 0xd8, 0xff],
    webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  };
  for (const [ext, values] of Object.entries(signatures)) {
    assert.equal(hasExpectedSignature(Uint8Array.from(values), ext), true);
    for (let length = 0; length < values.length; length++) assert.equal(hasExpectedSignature(Uint8Array.from(values.slice(0, length)), ext), false, `${ext} truncated ${length}`);
    assert.equal(hasExpectedSignature(new Uint8Array(20), ext), false);
    const bad = Uint8Array.from(values); bad[0] ^= 1;
    assert.equal(hasExpectedSignature(bad, ext), false);
  }
  assert.equal(hasExpectedSignature(Buffer.from('RIFF1234FAKE'), 'webp'), false);
  // These are integrity probes, NOT proof of safe validation of untrusted uploads.
});

test('material navigation round-trips combined course filters without arbitrary return URLs', () => {
  const filters = { category: 'certamen', year: 2024, term: 2, number: 2 };
  const href = materialHref(id, filters);
  assert.equal(href, `/materiales/${id}?tipo=certamenes&anio=2024&periodo=2&numero=2`);
  const parsed = parseCourseFilters(Object.fromEntries(new URL(href, 'http://localhost').searchParams));
  assert.deepEqual(parsed, { filters, errors: [] });
  assert.equal(courseHref('calculo-i', parsed.filters), '/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2');
  const rows = courseMaterials(demoCatalog, 'demo-calculo-i', parsed.filters);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.displayName === 'Certamen 2 - 2024-2' && row.course.curricularSemester === 1));
  assert.equal(materialHref(id), `/materiales/${id}`);
  const adversarial = materialHref('../unsafe?/#', { ...filters, returnTo: 'https://evil.example', curricularSemester: 2, status: 'pending' });
  assert.ok(adversarial.startsWith('/materiales/..%2Funsafe%3F%2F%23?'));
  assert.ok(!/evil|returnTo|status|curricularSemester/.test(adversarial));
});

test('HTTP materials: real bytes, download headers, unavailable/private and no client leaks', { skip: !base }, async t => {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Only local demo servers allowed');
  await t.test('four formats return exact asset bytes inline and as attachment', async () => {
    for (const [materialId, entry] of Object.entries(demoMaterialFiles)) {
      const expected = await readFile(asset(entry.filename));
      const material = publicMaterialById(demoCatalog, materialId);
      const name = normalizedDownloadName(material.displayName, entry.extension);
      for (const download of [false, true]) {
        const path = `/materiales/${materialId}/archivo${download ? '?descargar=1' : ''}`;
        const res = await request(path);
        assert.equal(res.status, 200, path);
        assert.equal(res.headers.get('content-type'), fileFormats[entry.extension].mimeType);
        assert.equal(res.headers.get('content-length'), String(expected.length));
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.match(res.headers.get('cache-control'), /no-store/);
        const disposition = res.headers.get('content-disposition');
        assert.ok(disposition.startsWith(download ? 'attachment;' : 'inline;'));
        assert.ok(disposition.includes(`filename="${name}"`));
        assert.ok(disposition.includes(`filename*=UTF-8''${encodeURIComponent(name)}`));
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), expected, path);
      }
      const res = await request(`/materiales/${materialId}`);
      assert.equal(res.status, 200);
      const html = await res.text(); noPrivate(html);
      assert.ok(html.includes(material.displayName));
      assert.ok(html.includes(`download="${name}"`));
      assert.ok(html.includes(`/materiales/${materialId}/archivo?descargar=1`));
    }
  });
  await t.test('approved metadata without file never offers a download link', async () => {
    for (const materialId of unavailable) {
      const res = await request(`/materiales/${materialId}`);
      assert.equal(res.status, 200);
      const html = await res.text(); noPrivate(html);
      assert.ok(html.includes('Archivo no disponible'));
      assert.ok(!/<a\b[^>]*(?:download=|href="[^"]*\/archivo)/.test(html));
      for (const suffix of ['/archivo', '/archivo?descargar=1']) assert.equal((await request(`/materiales/${materialId}${suffix}`)).status, 404);
    }
  });
  await t.test('private and unknown IDs cannot be overridden by query or headers', async () => {
    for (const materialId of [...privateRows.map(row => row.id), 'no-existe', '__proto__', 'constructor']) {
      for (const suffix of ['', '/archivo', '/archivo?descargar=1&status=approved&role=admin&id=demo-certamen-calculo-2']) {
        const path = `/materiales/${materialId}${suffix}`;
        const res = await request(path, { headers: { 'x-user-role': 'admin', Cookie: 'role=admin; status=approved' } });
        assert.equal(res.status, 404, path);
        noPrivate(await res.text(), path);
      }
    }
    for (const attempted of ['..%2F..%2Fpackage.json', '%2e%2e%5cpackage.json', 'demo-certamen-calculo-2%2F..%2Fdemo-pending-calculo']) {
      const path = `/materiales/${attempted}/archivo?descargar=1`;
      const res = await request(path, { redirect: 'manual' });
      assert.ok([400, 404].includes(res.status), `${path}: ${res.status}`);
      noPrivate(await res.text(), path);
    }
    const expected = await readFile(asset(demoMaterialFiles[id].filename));
    const res = await request(`/materiales/${id}/archivo?file=../../package.json&id=demo-pending-calculo&status=pending`);
    assert.equal(res.status, 200);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), expected, 'only the approved route ID selects bytes');
  });
  await t.test('material HTML, RSC and linked JS do not serialize private fixtures', async () => {
    const scripts = new Set();
    for (const materialId of [id, ...unavailable]) {
      const path = `/materiales/${materialId}?tipo=certamenes&anio=2024&periodo=2&numero=2`;
      const res = await request(path); assert.equal(res.status, 200);
      const html = await res.text(); noPrivate(html, path);
      for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(match[1]);
      const rsc = await request(path, { headers: { RSC: '1' } });
      assert.equal(rsc.status, 200); assert.match(rsc.headers.get('content-type'), /text\/x-component/);
      noPrivate(await rsc.text(), path);
    }
    assert.ok(scripts.size > 0);
    for (const path of scripts) {
      const res = await request(path); assert.equal(res.status, 200);
      noPrivate(await res.text(), path);
    }
  });
});
