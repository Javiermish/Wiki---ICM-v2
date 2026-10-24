import assert from 'node:assert/strict';

/** Only called with the disposable cluster created by run-catalog-sql-tests.mjs. */
export async function testCatalogConcurrency(pg) {
  const observer = pg.getPgClient(), first = pg.getPgClient(), second = pg.getPgClient();
  const owner = '24000000-0000-0000-0000-000000000001', reviewer = '24000000-0000-0000-0000-000000000002';
  const begin = async (client, actor) => {
    await client.query('begin; set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
  };
  const insert = async (client, number) => client.query(`insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
    values ($1,'regular',1,'plan-ilustrativo','Valid justification') returning id`, [`Concurrent quota ${number}`]);
  async function assertBlocked() {
    // Observe the actual server lock, not a guessed sleep before committing.
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [second.processID]);
      if (result.rows[0]?.wait_event_type === 'Lock') return;
      await new Promise(done => setTimeout(done, 20));
    }
    assert.fail('Second transaction did not wait on the PostgreSQL lock');
  }
  try {
    await Promise.all([observer.connect(), first.connect(), second.connect()]);
    await observer.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'concurrent-owner@example.invalid',now()),($2,'concurrent-reviewer@example.invalid',now());`, [owner, reviewer]);
    await observer.query("update public.user_roles set role='moderator' where user_id=$1", [reviewer]);
    await begin(first, owner);
    for (let number = 0; number < 9; number++) await insert(first, number);
    await first.query('commit');
    await begin(first, owner);
    const request = await insert(first, 9);
    await begin(second, owner);
    const waiting = insert(second, 10).then(() => null, error => error.code);
    await assertBlocked();
    await first.query('commit');
    assert.equal(await waiting, '22023');
    await second.query('rollback');
    assert.equal((await observer.query('select count(*)::int as n from public.course_creation_requests where requested_by=$1', [owner])).rows[0].n, 10);

    await begin(first, reviewer); await begin(second, reviewer);
    await first.query("select public.review_course_request($1,'approved','Reviewed')", [request.rows[0].id]);
    const repeated = second.query("select public.review_course_request($1,'approved','Reviewed')", [request.rows[0].id]).then(() => null, error => error.code);
    await assertBlocked();
    await first.query('commit');
    assert.equal(await repeated, '55000');
    await second.query('rollback');
    assert.equal((await observer.query('select count(*)::int as n from public.course_request_review_events where request_id=$1', [request.rows[0].id])).rows[0].n, 1);
  } finally {
    // Release any lock before closing connections even when an assertion fails.
    await Promise.allSettled([first.query('rollback'), second.query('rollback')]);
    await Promise.allSettled([first.end(), second.end(), observer.end()]);
  }
}
