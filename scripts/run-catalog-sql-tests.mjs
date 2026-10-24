/** Real disposable PostgreSQL only: no DATABASE_URL, remote DB, or application credentials.
 * WIKI_EMBEDDED_POSTGRES_MODULE=/absolute/path/to/embedded-postgres/dist/index.js node scripts/run-catalog-sql-tests.mjs
 * Install optional harness OUTSIDE this repo; see docs/QA_POSTGRES_LOCAL.md.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testCatalogConcurrency } from './test-catalog-concurrency.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const authOnly = process.argv.includes('--auth-only');
assert.ok(process.argv.slice(2).every(arg => arg === '--auth-only'), 'Only --auth-only is accepted; external DB URLs are never accepted.');
const modulePath = process.env.WIKI_EMBEDDED_POSTGRES_MODULE;
assert.ok(modulePath && isAbsolute(modulePath), 'Set WIKI_EMBEDDED_POSTGRES_MODULE to an existing absolute embedded-postgres/dist/index.js path.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
await mkdir('/tmp/opencode', { recursive: true });
const evidence = await mkdtemp('/tmp/opencode/wiki-sql-qa-');
const report = { started: new Date().toISOString(), evidence, engine: 'real PostgreSQL; synthetic auth schema, not Supabase Auth/PostgREST', authOnly, passes: [] };
const server = createServer();
await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
const port = server.address().port;
await new Promise(done => server.close(done));
const pg = new EmbeddedPostgres({ databaseDir: resolve(evidence, 'db'), port, user: 'postgres', password: randomBytes(24).toString('hex'), persistent: false, postgresFlags: ['-h', '127.0.0.1', '-k', evidence], onLog: () => {}, onError: error => console.error(error.message) });

// This intentionally implements only the two psql directives used by these tests.
async function sqlFile(path, stack = []) {
  assert.ok(path.startsWith(`${resolve(root, 'supabase')}/`), 'SQL includes must stay inside supabase/');
  assert.ok(!stack.includes(path), `Recursive SQL include: ${path}`);
  const chunks = [];
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (/^\\set ON_ERROR_STOP on\s*$/.test(line)) continue;
    const include = line.match(/^\\ir\s+([^\s]+)\s*$/);
    if (include) chunks.push(await sqlFile(resolve(dirname(path), include[1]), [...stack, path]));
    else { assert.ok(!/^\s*\\/.test(line), `Unsupported psql directive: ${line}`); chunks.push(line); }
  }
  return chunks.join('\n');
}
async function run(path) {
  const client = pg.getPgClient();
  try { await client.connect(); await client.query(await sqlFile(path)); }
  finally { await client.end(); }
  report.passes.push(path.slice(root.length + 1));
  console.log('PASS', report.passes.at(-1));
}
try {
  await pg.initialise(); await pg.start();
  const client = pg.getPgClient();
  try {
    await client.connect();
    report.version = (await client.query('select version()')).rows[0].version;
    await client.query(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
  } finally { await client.end(); }
  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    if (authOnly && !/^20261022000[12]_/.test(name)) continue;
    await run(resolve(root, 'supabase/migrations', name));
  }
  if (!authOnly) await run(resolve(root, 'supabase/tests/inspect_catalog_seed.sql'));
  for (const name of ['profiles_roles.sql', 'backfill_existing_accounts.sql', ...(!authOnly ? ['catalog.sql', 'catalog_quotas.sql', 'catalog_seed.sql'] : [])]) await run(resolve(root, 'supabase/tests', name));
  if (!authOnly) {
    await testCatalogConcurrency(pg);
    report.passes.push('concurrent quota and review (two real connections)');
    console.log('PASS', report.passes.at(-1));
  }
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  await pg.stop();
  await writeFile(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Evidence:', resolve(evidence, 'report.json'));
}
