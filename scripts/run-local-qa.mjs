/** Isolated production build and loopback fixtures. No remote credentials or writes. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { startCatalogFixture } from '../tests/fixtures/catalog-server.mjs';

await mkdir('/tmp/opencode', { recursive: true });
const artifacts = await mkdtemp('/tmp/opencode/wiki-regressions-');
const fixture = await startCatalogFixture();
const base = 'http://127.0.0.1:3123';
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-qa-not-a-credential',
  SUPABASE_SERVICE_ROLE_KEY: '', R2_ENDPOINT: '', R2_BUCKET: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '',
  SITE_URL: base, NEXT_TELEMETRY_DISABLED: '1', WIKI_ENABLE_DEMO_MATERIALS: process.argv.includes('--without-samples') ? 'false' : 'true',
  WIKI_MATERIAL_UPLOAD_DIAGNOSTICS: 'false', WIKI_TEST_BASE_URL: base, WIKI_TEST_PRODUCTION_MANIFEST: 'true' };
const results = [];
async function run(name, command, args, extra = {}) {
  const child = spawn(command, args, { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  await writeFile(`${artifacts}/${name}.log`, log);
  results.push({ name, code, log: `${artifacts}/${name}.log` });
  console.log(`${name}: ${code === 0 ? 'PASS' : 'FAIL'} (${artifacts}/${name}.log)`);
  return code;
}
let app;
try {
  // Refuse an occupied port instead of accidentally testing somebody else's server.
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(3123, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
  if (await run('build', 'pnpm', ['build'])) throw new Error('Isolated build failed');
  app = spawn('pnpm', ['start', '--hostname', '127.0.0.1', '--port', '3123'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let serverLog = '';
  app.stdout.on('data', data => { serverLog += data; });
  app.stderr.on('data', data => { serverLog += data; });
  try {
    const deadline = Date.now() + 60000;
    for (;;) {
      if (app.exitCode !== null) throw new Error('Local app exited');
      try { if ((await fetch(base)).status === 200) break; } catch {}
      if (Date.now() > deadline) throw new Error('Local app readiness timeout');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    await run('http', 'pnpm', ['test']);
    for (const name of ['auth', 'materials', 'catalog', 'favorites', 'contributions', 'persistent-catalog', 'tasks']) {
      await run(`browser-${name}`, process.execPath, [`tests/browser-${name}.mjs`], { WIKI_CATALOG_QA_MODE: 'public' });
    }
    fixture.setUnavailable(true);
    await run('browser-catalog-error', process.execPath, ['tests/browser-persistent-catalog.mjs'], { WIKI_CATALOG_QA_MODE: 'error' });
  } finally { await writeFile(`${artifacts}/server.log`, serverLog); }
} catch (error) {
  results.push({ name: 'runner', code: 1, error: error.message });
  console.error(error.message);
} finally {
  if (app?.pid) { try { process.kill(-app.pid, 'SIGTERM'); } catch {} }
  await fixture.close();
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ results, requests: fixture.requests }, null, 2));
  console.log(`Report: ${artifacts}/report.json`);
  if (results.some(result => result.code !== 0)) process.exitCode = 1;
}
