import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createServer } from 'node:http';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const bytes = 3;

const key = 'materials/21000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000002.pdf';
const env = { NODE_ENV: 'test', R2_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com', R2_BUCKET: 'private', R2_ACCESS_KEY_ID: 'fake', R2_SECRET_ACCESS_KEY: 'fake' };
async function storage(send = async () => ({}), environment = env) {
  const calls = [];
  const source = (await readFile(new URL('../src/lib/materials/r2.ts', import.meta.url), 'utf8')).replace(/^import .*?;$/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('export ', '');
  const bindings = { process: { env: environment }, S3Client: class { constructor(config) { calls.push({ config }); } async send(command) { calls.push(command); return send(command); } }, getSignedUrl: async (_client, command, options) => { calls.push({ command, options }); return 'https://signed.example'; } };
  for (const name of ['PutObjectCommand', 'GetObjectCommand', 'HeadObjectCommand', 'DeleteObjectCommand']) bindings[name] = class { constructor(input) { this.input = input; this.name = name; } };
  return { api: new Function(...Object.keys(bindings), `${js}; return {isR2Configured,signR2Upload,readR2Object,deleteR2Object,signR2Read};`)(...Object.values(bindings)), calls };
}
test('private SDK operations use canonical keys, write-once signed uploads and short signatures', async () => {
  const { api, calls } = await storage(async command => command.name === 'GetObjectCommand' ? { Body: (async function* () { yield Buffer.from('pdf'); })(), ContentLength: 3, ContentType: 'application/pdf' } : {});
  assert.equal(api.isR2Configured(), true);
  assert.equal(await api.signR2Upload(key, 'application/pdf', bytes), 'https://signed.example');
  const upload = calls.at(-1);
  assert.equal(upload.command.name, 'PutObjectCommand');
  assert.deepEqual([upload.command.input.ContentType, upload.command.input.ContentLength, upload.command.input.IfNoneMatch], ['application/pdf', bytes, '*']);
  assert.deepEqual([...upload.options.signableHeaders].sort(), ['content-length', 'content-type', 'if-none-match']);
  assert.ok(upload.options.expiresIn <= 300);
  assert.equal(calls[0].config.requestChecksumCalculation, 'WHEN_REQUIRED');
  assert.deepEqual(await api.readR2Object(key), { data: Buffer.from('pdf'), mimeType: 'application/pdf' });
  await api.deleteR2Object(key);
  assert.equal(await api.signR2Read(key, 'Certamen 1 - 2024-2.pdf'), 'https://signed.example');
  assert.equal(calls.at(-1).options.expiresIn, 60);
  assert.match(calls.at(-1).command.input.ResponseContentDisposition, /^attachment/);
  await api.signR2Read(key, 'Certamen 1 - 2024-2.pdf', 'inline');
  assert.match(calls.at(-1).command.input.ResponseContentDisposition, /^inline; filename="Certamen 1 - 2024-2.pdf"/);
  for (const bad of ['../secret', key.toUpperCase(), 'materials/a/b.pdf', `${key}?x=1`]) await assert.rejects(api.readR2Object(bad));
});
test('signed uploads refuse a type, size or key that the reservation did not fix', async () => {
  const { api, calls } = await storage();
  for (const [badKey, mime, size] of [[key, 'text/html', bytes], [key, 'image/png', bytes], [key, 'application/pdf', 0], [key, 'application/pdf', 25 * 1024 * 1024 + 1], [key, 'application/pdf', 1.5], ['materials/a/b.pdf', 'application/pdf', bytes]]) {
    await assert.rejects(api.signR2Upload(badKey, mime, size));
  }
  assert.ok(!calls.some(call => call.command));
});
test('configuration rejects incomplete, arbitrary and malformed endpoints without SDK calls', async () => {
  for (const endpoint of ['', 'https://evil.example', 'https://abc.r2.cloudflarestorage.com/path', 'https://abc.r2.cloudflarestorage.com/?x=1', 'https://user:pass@abc.r2.cloudflarestorage.com', 'http://abc.r2.cloudflarestorage.com']) {
    const { api, calls } = await storage(undefined, { ...env, R2_ENDPOINT: endpoint });
    assert.equal(api.isR2Configured(), false);
    await assert.rejects(api.readR2Object(key));
    assert.equal(calls.length, 0);
  }
  assert.equal((await storage(undefined, { ...env, R2_SECRET_ACCESS_KEY: '' })).api.isR2Configured(), false);
  assert.equal((await storage(undefined, { ...env, NODE_ENV: 'production', R2_ENDPOINT: 'http://localhost:9000' })).api.isR2Configured(), false);
  assert.equal((await storage(undefined, { ...env, R2_ENDPOINT: 'http://localhost:9000' })).api.isR2Configured(), true);
});
test('bounds streaming bytes, verifies length, closes overflow and sanitizes SDK failures', async () => {
  let closed = false;
  const tooLarge = await storage(async () => ({ Body: (async function* () { try { yield Buffer.alloc(25 * 1024 * 1024); yield Buffer.from('x'); } finally { closed = true; } })() }));
  await assert.rejects(tooLarge.api.readR2Object(key));
  assert.equal(closed, true);
  for (const result of [{ ContentLength: 26 * 1024 * 1024 }, { ContentLength: 2, Body: (async function* () { yield Buffer.from('x'); })() }, {}]) await assert.rejects((await storage(async () => result)).api.readR2Object(key));
  const { api } = await storage(async () => { throw new Error('secret credentials endpoint'); });
  for (const run of [() => api.readR2Object(key), () => api.deleteR2Object(key)]) await assert.rejects(run(), error => !error.message.includes('secret'));
});
test('SDK real aborta peticiones lentas: el límite no es solo una advertencia (loopback)', async () => {
  const { api, calls } = await storage();
  await api.deleteR2Object(key);
  const configured = calls[0].config;
  const server = createServer((_request,response) => {
    const timer = setTimeout(() => { response.writeHead(200); response.end(); },150);
    response.on('close',() => clearTimeout(timer));
  });
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  const client = new S3Client({ ...configured, endpoint: `http://127.0.0.1:${server.address().port}`, forcePathStyle: true, maxAttempts: 1,
    requestHandler: { ...configured.requestHandler, requestTimeout: 20 } });
  try {
    await assert.rejects(client.send(new HeadObjectCommand({ Bucket: 'private',Key: key })),error => error.name === 'TimeoutError');
  } finally {
    client.destroy(); server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
