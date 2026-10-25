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
import { testMaterialsConcurrency } from './test-materials-concurrency.mjs';
import { formUploadDraft } from '../tests/fixtures/material-upload.mjs';
import { validateContributionDraft } from '../src/domain/contribution.ts';

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
// Exercise the incremental migration against an actual pre-existing row, not just empty DDL.
// All fixture writes/cleanup are confined to this disposable local PostgreSQL instance.
async function runTaskMigration(path) {
  const client = pg.getPgClient();
  const owner = '29000000-0000-0000-0000-000000000001';
  const operation = '29000000-0000-0000-0000-000000000011';
  let material;
  const formMetadata = validateContributionDraft(formUploadDraft, [{ id: formUploadDraft.courseId, status: 'active' }]);
  assert.equal(formMetadata.ok, true);
  const probeForm = async (legacy) => {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
      const reserve = () => client.query(`select * from public.reserve_material_upload($1,$2::jsonb,
        'tarea.pdf','application/pdf',42,'pdf',repeat('a',64))`, ['29000000-0000-0000-0000-000000000012', JSON.stringify(formMetadata.value)]);
      if (legacy) await assert.rejects(reserve(), error => error.code === '22023' && error.message === 'Invalid upload metadata');
      else {
        const { rows: [row] } = await reserve();
        assert.equal(row.category, 'tarea');
        assert.equal(row.document_number, 2);
        assert.equal(row.status, 'pending');
        assert.equal(row.upload_state, 'uploading');
        const { rows: [offering] } = await client.query('select * from public.course_offerings where id = $1', [row.offering_id]);
        assert.equal(offering.course_id, 'demo-calculo-i');
        assert.equal(offering.academic_year, 2025);
        assert.equal(offering.academic_term, 1);
      }
    } finally { await client.query('rollback'); }
  };
  const snapshot = async () => (await client.query(`select jsonb_build_object(
    'row',(select to_jsonb(m) from public.materials m where m.operation_id = $1),
    'offering',(select to_jsonb(o) from public.course_offerings o join public.materials m on m.offering_id = o.id where m.operation_id = $1),
    'functions',(select jsonb_agg((to_jsonb(p) - 'prosrc') || jsonb_build_object('prosrc',
      case when p.proname = 'reserve_material_upload' then replace(p.prosrc,
        '(''listado'',''apunte'',''certamen'')','(''listado'',''apunte'',''certamen'',''tarea'')') else p.prosrc end) order by p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')),
    'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
    'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private')),
    'view',pg_get_viewdef('public.public_materials'::regclass,true),
    'indexes',(select jsonb_agg(to_jsonb(i) order by i.indexname) from pg_indexes i where i.schemaname in ('public','private')),
    'constraints',(select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname in ('public','private') and c.conname <> 'materials_category_check')
    ) as snapshot`, [operation])).rows[0].snapshot;
  try {
    await client.connect();
    await client.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [owner, 'task-migration@example.invalid']);
    await probeForm(true);
    await client.query('begin');
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
    const result = await client.query(`select * from public.reserve_material_upload($1,
      '{"courseId":"demo-calculo-i","academicYear":2024,"academicTerm":2,"category":"certamen","documentNumber":2}',
      'legacy.pdf','application/pdf',42,'pdf',repeat('f',64))`, [operation]);
    material = result.rows[0];
    await client.query('commit');
    const before = await snapshot();
    await run(path);
    assert.deepEqual(await snapshot(), before, 'Incremental task migration preserves legacy row/offering, ACLs, RLS, indexes, other constraints and all function bodies except the category allowlist');
    await probeForm(false);
    report.passes.push('actual form draft: legacy RPC rejects tarea with 22023; incremental accepts numeric metadata privately');
    console.log('PASS', report.passes.at(-1));
    report.passes.push('task migration preserves existing row and security/locks/validation/permissions');
    console.log('PASS', report.passes.at(-1));
  } finally {
    await client.query('rollback');
    if (material) {
      await client.query('delete from public.materials where id = $1', [material.id]);
      await client.query('delete from public.course_offerings where id = $1', [material.offering_id]);
    }
    await client.query('delete from auth.users where id = $1', [owner]);
    await client.end();
  }
}
try {
  await pg.initialise(); await pg.start();
  const client = pg.getPgClient();
  try {
    await client.connect();
    report.version = (await client.query('select version()')).rows[0].version;
    await client.query(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated;`);
  } finally { await client.end(); }
  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    if (authOnly && !/^20261022000[12]_/.test(name)) continue;
    const path = resolve(root, 'supabase/migrations', name);
    if (name === '202610240001_material_tasks.sql') await runTaskMigration(path);
    else await run(path);
  }
  if (!authOnly) await run(resolve(root, 'supabase/tests/inspect_catalog_seed.sql'));
  for (const name of ['profiles_roles.sql', 'backfill_existing_accounts.sql', ...(!authOnly ? ['catalog.sql', 'catalog_quotas.sql', 'materials.sql', 'materials_quotas.sql', 'materials_budgets.sql', 'material_tasks.sql'] : [])]) await run(resolve(root, 'supabase/tests', name));
  if (!authOnly) {
    await testCatalogConcurrency(pg);
    report.passes.push('concurrent quota and review (two real connections)');
    console.log('PASS', report.passes.at(-1));
    await testMaterialsConcurrency(pg);
    report.passes.push('materials concurrent quota, idempotency, review and cleanup/finalize');
    console.log('PASS', report.passes.at(-1));
    // Seed replay deliberately archives a fixture course; keep it last.
    await run(resolve(root, 'supabase/tests/catalog_seed.sql'));
  }
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  await pg.stop();
  await writeFile(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Evidence:', resolve(evidence, 'report.json'));
}
