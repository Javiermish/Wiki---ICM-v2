import assert from 'node:assert/strict';

/** Two real connections; only the disposable cluster owned by the SQL runner. */
export async function testMaterialsConcurrency(pg) {
  const observer = pg.getPgClient(), first = pg.getPgClient(), second = pg.getPgClient();
  const owner = '27000000-0000-0000-0000-000000000001', reviewer = '27000000-0000-0000-0000-000000000002';
  const begin = async (client, actor = owner, role = 'authenticated') => {
    assert.ok(['authenticated', 'service_role'].includes(role));
    await client.query(`begin; set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
  };
  const reserve = (client, number, op = '27000000-0000-0000-0000-' + String(number).padStart(12, '0')) =>
    client.query(`select * from public.reserve_material_upload($1,$2::jsonb,'x.pdf','application/pdf',42,'pdf',repeat('a',64))`,
      [op, JSON.stringify({ courseId: 'demo-calculo-i', academicYear: 2024, academicTerm: 2, category: 'certamen', documentNumber: number })]);
  async function assertBlocked() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [second.processID]);
      if (result.rows[0]?.wait_event_type === 'Lock') return;
      await new Promise(done => setTimeout(done, 20));
    }
    assert.fail('Second material transaction did not wait on a PostgreSQL lock');
  }
  try {
    await Promise.all([observer.connect(), first.connect(), second.connect()]);
    await observer.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'material-race-owner@example.invalid',now()),($2,'material-race-reviewer@example.invalid',now())`, [owner, reviewer]);
    await observer.query("update public.user_roles set role='moderator' where user_id=$1", [reviewer]);
    // Pre-body attempt budgets serialize too: concurrent 20th/21st cannot both pass.
    await begin(first);
    for (let n = 1; n <= 19; n++) {
      assert.equal((await first.query('select public.authorize_material_upload_attempt() as allowed')).rows[0].allowed, true);
    }
    await first.query('commit');
    await begin(first); await begin(second);
    assert.equal((await first.query('select public.authorize_material_upload_attempt() as allowed')).rows[0].allowed, true);
    const lastAttempt = second.query('select public.authorize_material_upload_attempt() as allowed');
    await assertBlocked(); await first.query('commit');
    assert.equal((await lastAttempt).rows[0].allowed, false);
    await second.query('commit');
    assert.equal((await observer.query('select attempts from private.material_upload_budgets where user_id=$1', [owner])).rows[0].attempts, 20);
    // Same operation racing in separate HTTP requests creates exactly one row.
    await begin(first); await begin(second);
    const original = await reserve(first, 1);
    const retry = reserve(second, 1);
    await assertBlocked(); await first.query('commit');
    assert.equal((await retry).rows[0].id, original.rows[0].id);
    await second.query('commit');
    await begin(first);
    for (let n = 2; n <= 9; n++) await reserve(first, n);
    await first.query('commit');
    await begin(first); const tenth = await reserve(first, 10);
    await begin(second);
    const overflow = reserve(second, 11).then(() => null, error => error.code);
    await assertBlocked(); await first.query('commit');
    assert.equal(await overflow, '22023'); await second.query('rollback');
    assert.equal((await observer.query('select count(*)::int n from public.materials where uploaded_by=$1', [owner])).rows[0].n, 10);

    // Review CAS: exactly one actor resolves and one event is committed.
    await begin(first, owner, 'service_role');
    await first.query('select public.finalize_material_upload($1,$2)', [tenth.rows[0].id, owner]);
    await first.query('commit');
    await begin(first, reviewer); await begin(second, reviewer);
    await first.query("select public.review_material($1,'approved','First review')", [tenth.rows[0].id]);
    const review = second.query("select public.review_material($1,'rejected','Conflicting review')", [tenth.rows[0].id]).then(() => null, error => error.code);
    await assertBlocked(); await first.query('commit');
    assert.equal(await review, '55000'); await second.query('rollback');
    assert.equal((await observer.query('select count(*)::int n from public.material_review_events where material_id=$1', [tenth.rows[0].id])).rows[0].n, 1);

    // Retrying an old upload acquires its row and renews the lease before PUT.
    const retryId = (await observer.query('select id from public.materials where uploaded_by=$1 and document_number=4', [owner])).rows[0].id;
    await observer.query("update public.materials set submitted_at=now()-interval '25 hours',updated_at=now()-interval '25 hours' where id=$1", [retryId]);
    await begin(first); await reserve(first, 4);
    await begin(second, owner, 'service_role');
    assert.equal((await second.query('select * from public.expire_material_uploads()')).rows.length, 0, 'expiry skips the retry-locked row');
    await second.query('commit'); await first.query('commit');
    assert.equal((await observer.query("select upload_state='uploading' and updated_at > now()-interval '1 minute' and submitted_at < now()-interval '24 hours' as protected from public.materials where id=$1", [retryId])).rows[0].protected, true);

    // Expiry winning first makes the waiting retry return failed; caller must not PUT.
    const expiredRetryId = (await observer.query('select id from public.materials where uploaded_by=$1 and document_number=5', [owner])).rows[0].id;
    await observer.query("update public.materials set updated_at=now()-interval '25 hours' where id=$1", [expiredRetryId]);
    await begin(first, owner, 'service_role');
    assert.ok((await first.query('select * from public.expire_material_uploads()')).rows.some(row => row.material_id === expiredRetryId));
    await begin(second);
    const expiredRetry = reserve(second, 5);
    await assertBlocked(); await first.query('commit');
    const failedRetryRow = (await expiredRetry).rows[0];
    assert.equal(failedRetryRow.id, expiredRetryId);
    assert.equal(failedRetryRow.upload_state, 'failed');
    await second.query('commit');
    assert.equal((await observer.query('select upload_state from public.materials where id=$1', [expiredRetryId])).rows[0].upload_state, 'failed');

    const readyId = original.rows[0].id;
    const expiringId = (await observer.query('select id from public.materials where uploaded_by=$1 and document_number=2', [owner])).rows[0].id;
    // Older uploading rows are eligible, but finalization holding the row wins safely.
    await observer.query("update public.materials set submitted_at=now()-interval '25 hours',updated_at=now()-interval '25 hours' where id=any($1::uuid[])", [[readyId, expiringId]]);
    await begin(first, owner, 'service_role');
    await first.query('select public.finalize_material_upload($1,$2)', [readyId, owner]);
    await begin(second, owner, 'service_role');
    const cleanup = await second.query('select * from public.expire_material_uploads()');
    assert.ok(!cleanup.rows.some(row => row.material_id === readyId), 'cleanup must skip a finalizing row');
    assert.ok(cleanup.rows.some(row => row.material_id === expiringId), 'cleanup marks the other abandoned row');
    await second.query('commit'); await first.query('commit');
    assert.equal((await observer.query('select upload_state from public.materials where id=$1', [readyId])).rows[0].upload_state, 'ready');

    // Opposite ordering: cleanup holds the row, finalize must wait and then fail.
    const racedId = (await observer.query('select id from public.materials where uploaded_by=$1 and document_number=3', [owner])).rows[0].id;
    await observer.query("update public.materials set submitted_at=now()-interval '25 hours',updated_at=now()-interval '25 hours' where id=$1", [racedId]);
    await begin(first, owner, 'service_role');
    const expired = await first.query('select * from public.expire_material_uploads()');
    assert.ok(expired.rows.some(row => row.material_id === racedId));
    await begin(second, owner, 'service_role');
    const finalize = second.query('select public.finalize_material_upload($1,$2)', [racedId, owner]).then(() => null, error => error.code);
    await assertBlocked(); await first.query('commit');
    assert.equal(await finalize, '55000'); await second.query('rollback');
    assert.equal((await observer.query('select upload_state from public.materials where id=$1', [racedId])).rows[0].upload_state, 'failed');
  } finally {
    await Promise.allSettled([first.query('rollback'), second.query('rollback')]);
    await Promise.allSettled([first.end(), second.end(), observer.end()]);
  }
}
