// Opt-in disposable PostgreSQL only; never accepts a DB URL or application credentials.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.WIKI_EMBEDDED_POSTGRES_MODULE;
test('QA cleanup template fails closed and deletes only its exact manifest locally', { skip: !modulePath }, async () => {
  assert.ok(isAbsolute(modulePath));
  const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
  const evidence = await mkdtemp('/tmp/opencode/wiki-cleanup-qa-');
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  const pg = new EmbeddedPostgres({ databaseDir: resolve(evidence, 'db'), port, user: 'postgres',
    password: randomBytes(24).toString('hex'), persistent: false,
    postgresFlags: ['-h', '127.0.0.1', '-k', evidence], onLog: () => {}, onError: () => {} });
  const report = { engine: 'disposable local PostgreSQL; synthetic auth only', checks: [] };
  let client;
  try {
    await pg.initialise(); await pg.start();
    client = pg.getPgClient(); await client.connect();
    await client.query(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
        created_at timestamptz default now(), raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(await readFile(resolve('supabase/migrations', file), 'utf8'));
    }
    const template = await readFile('scripts/qa-catalog-cleanup.sql', 'utf8');
    const manifest = { status: 'PASS', runId: 'qa-20261023-abcdef12', started: new Date().toISOString(),
      accounts: Object.fromEntries(['studentA', 'studentB', 'moderator', 'admin'].map(role => [role, randomUUID()])) };
    const { studentA, studentB, moderator, admin } = manifest.accounts;
    const outsider = randomUUID();
    for (const id of [...Object.values(manifest.accounts), outsider]) {
      await client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `${id}@example.invalid`]);
    }
    await client.query("update public.user_roles set role='admin' where user_id=$1", [admin]);
    await client.query("update public.user_roles set role='moderator' where user_id=$1", [moderator]);
    // Role setup is not part of the authenticated QA run; preserve it as unrelated audit.
    manifest.started = new Date().toISOString();
    const actor = id => client.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const prefix = `QA ${manifest.runId} `;
    await actor(admin);
    const direct = (await client.query(`insert into public.courses(name,kind,curricular_semester,curriculum_id)
      values($1,'regular',12,'plan-ilustrativo') returning id`, [prefix + 'Administracion'])).rows[0].id;
    await client.query('update public.courses set name=$1 where id=$2', [prefix + 'Administracion Editado', direct]);
    for (const status of ['archived', 'active']) await client.query('update public.courses set status=$1 where id=$2', [status, direct]);
    manifest.requestIds = [];
    for (const [owner, name] of [[studentA, 'Aprobacion'], [studentB, 'Rechazo'], [studentA, 'Duplicado']]) {
      await actor(owner);
      manifest.requestIds.push((await client.query(`insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
        values($1,'regular',12,'plan-ilustrativo','Local QA only') returning id`, [prefix + name])).rows[0].id);
    }
    await actor(moderator);
    const approved = (await client.query("select public.review_course_request($1,'approved','Local QA') id", [manifest.requestIds[0]])).rows[0].id;
    await client.query("select public.review_course_request($1,'rejected','Local QA')", [manifest.requestIds[1]]);
    await actor(admin);
    await client.query("select public.review_course_request($1,'rejected','Local QA')", [manifest.requestIds[2]]);
    manifest.courseIds = [direct, approved];
    await client.query("update public.courses set status='archived' where id=any($1::text[])", [manifest.courseIds]);
    manifest.adminEventIds = (await client.query('select id from public.course_admin_events where course_id=any($1::text[])', [manifest.courseIds])).rows.map(r => r.id);
    manifest.reviewEventIds = (await client.query('select id from public.course_request_review_events where request_id=any($1::uuid[])', [manifest.requestIds])).rows.map(r => r.id);
    manifest.finished = new Date(Date.now() + 1000).toISOString();
    assert.equal(manifest.adminEventIds.length, 7); assert.equal(manifest.reviewEventIds.length, 3);
    const tables = ['courses', 'course_creation_requests', 'course_admin_events', 'course_request_review_events', 'role_change_events', 'auth.users'];
    async function snapshot() {
      const rows = [];
      for (const table of tables) rows.push((await client.query(`select coalesce(jsonb_agg(t order by id::text),'[]'::jsonb) data from ${table} t`)).rows[0].data);
      return rows;
    }
    const initial = await snapshot();
    function sql(m) {
      return template.replace("select set_config('wiki.qa_manifest', '', true);",
        `select set_config('wiki.qa_manifest', '${JSON.stringify(m).replaceAll("'", "''")}', true);`);
    }
    async function enabled() {
      const rows = (await client.query(`select tgenabled from pg_trigger where tgname in
        ('course_request_events_append_only','course_admin_events_append_only')`)).rows;
      assert.equal(rows.length, 2); assert.ok(rows.every(r => r.tgenabled === 'O'));
    }
    async function rejects(label, statement, expected) {
      await assert.rejects(client.query(statement), expected);
      await client.query('rollback'); await enabled();
      assert.deepEqual(await snapshot(), initial);
      report.checks.push(label);
    }
    await rejects('empty template aborts without changes', template, /Reviewed complete QA manifest required/);
    for (const field of ['status', 'runId', 'started', 'finished', 'accounts', 'courseIds', 'requestIds', 'adminEventIds', 'reviewEventIds']) {
      for (const value of ['absent', null]) {
        const m = structuredClone(manifest);
        if (value === 'absent') delete m[field]; else m[field] = null;
        await rejects(`${field} ${value} fails closed`, sql(m));
      }
    }
    for (const [label, alter] of [
      ['unlisted ID', m => { m.adminEventIds[0] = randomUUID(); }],
      ['wrong prefix', m => { m.runId = 'qa-20261023-00000000'; }],
      ['wrong actor', m => { m.accounts.admin = randomUUID(); }],
      ['reversed timestamps', m => { m.finished = '2000-01-01T00:00:00Z'; }],
    ]) {
      const m = structuredClone(manifest); alter(m); await rejects(label, sql(m));
    }
    // Keep these inserted rows inside the same transaction as cleanup so its abort also removes them.
    const guard = sql(manifest).replace(/^begin;/m, '');
    const foreignRows = [
      [`select set_config('request.jwt.claim.sub','${studentA}',true);
        insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification,requested_by)
        values('Foreign request','regular',1,'plan-ilustrativo','Local QA only','${studentA}')`, 'request owner'],
      [`insert into public.course_admin_events(course_id,actor_id,action,after_data) values('${direct}','${admin}','updated','{}')`, 'admin event'],
      [`select set_config('request.jwt.claim.sub','${outsider}',true);
        with r as (insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
          values('Unrelated request','regular',1,'plan-ilustrativo','Local QA only') returning id)
        insert into public.course_request_review_events(request_id,actor_id,action,notes)
          select id,'${moderator}','rejected','Local QA' from r`, 'review event'],
      [`insert into public.role_change_events(actor_id,target_user_id,old_role,new_role,reason) values('${admin}','${studentA}','student','moderator','Local QA only')`, 'role event'],
    ];
    for (const [insert, label] of foreignRows) {
      await rejects(`foreign ${label} blocks cleanup`, `begin; ${insert}; ${guard}`, /Unplanned dependencies/);
    }
    // Owner-only fault injection, rolled back with the rejected cleanup; never changes migrations.
    for (const change of [`reviewed_by='${outsider}'`, "resulting_course_id='demo-calculo-i'"]) {
      await rejects(`listed request with foreign ${change.split('=')[0]}`, `begin;
        alter table public.course_creation_requests disable trigger course_requests_review_audit;
        update public.course_creation_requests set ${change} where id='${manifest.requestIds[0]}';
        alter table public.course_creation_requests enable trigger course_requests_review_audit;
        ${guard}`, /QA identity/);
    }
    await rejects('listed review event with foreign result', `begin;
      alter table public.course_request_review_events disable trigger course_request_events_append_only;
      update public.course_request_review_events set resulting_course_id='demo-calculo-i' where request_id='${manifest.requestIds[0]}';
      alter table public.course_request_review_events enable trigger course_request_events_append_only;
      ${guard}`, /QA audit/);
    await client.query(sql(manifest));
    assert.deepEqual(await snapshot(), initial); await enabled();
    report.checks.push('exact manifest dry-run rolls back all rows and trigger state');
    // Pause immediately before the template's default rollback to inspect its deletion scope.
    await client.query(sql(manifest).replace(/rollback;\s*$/, ''));
    const cleaned = await snapshot();
    assert.deepEqual(cleaned[0], initial[0].filter(r => !manifest.courseIds.includes(r.id)));
    for (const [index, ids] of [[1, manifest.requestIds], [2, manifest.adminEventIds], [3, manifest.reviewEventIds]]) {
      assert.deepEqual(cleaned[index], initial[index].filter(r => !ids.includes(r.id)));
    }
    assert.deepEqual(cleaned[4], initial[4]); assert.deepEqual(cleaned[5], initial[5]); await enabled();
    await client.query('rollback');
    await rejects('append-only protection remains effective', 'delete from public.course_admin_events', { code: '55000' });
    report.checks.push('only listed IDs deleted; seed, users, role events preserved; triggers enabled before rollback');
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed'; report.error = error.message; throw error;
  } finally {
    if (client) await client.end();
    await pg.stop();
    await writeFile(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2));
    console.log('Cleanup evidence:', resolve(evidence, 'report.json'));
  }
});
