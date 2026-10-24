import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { validateConfig, makePlan, expectResult, runMatrix, verifyFinalState } from '../scripts/qa-authenticated-catalog.mjs';

const ids = Object.fromEntries(['studentA', 'studentB', 'moderator', 'admin'].map((name, i) => [name, `00000000-0000-4000-8000-00000000000${i}`]));
const valid = { url: 'https://approved-ref.supabase.co', key: 'sb_publishable_test', project: 'approved-ref', runId: 'qa-20261023-0123abcd', accounts: ids };

test('QA remota exige proyecto exacto, clave pública, cuentas distintas y prefijo acotado', () => {
  assert.doesNotThrow(() => validateConfig(valid));
  for (const override of [
    { project: 'other-ref' }, { url: 'http://approved-ref.supabase.co' },
    { url: 'https://approved-ref.supabase.co.evil.invalid' }, { key: 'sb_secret_never-allowed' },
    { key: `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x` },
    { runId: 'qa-%' }, { accounts: { ...ids, studentA: ids.admin } }, { accounts: {} },
    { accounts: { ...ids, password: 'must-not-enter-manifest' } },
  ]) assert.throws(() => validateConfig({ ...valid, ...override }));
});

test('plan no usa IDs remotos inventados y declara todas las escrituras candidatas', () => {
  const plan = makePlan(valid.runId);
  assert.equal(plan.runId, valid.runId);
  assert.equal(plan.proposals.length, 4);
  assert.ok(plan.proposals.every(p => p.name.startsWith(`QA ${valid.runId} `)));
  assert.ok(plan.proposals.every(p => p.code.startsWith('QA-0123ABCD-')));
  assert.throws(() => makePlan('%'));
});

test('denegaciones y duplicados no aceptan éxitos vacíos o errores de red como prueba RLS', () => {
  assert.doesNotThrow(() => expectResult({ data: null, error: { code: '42501' } }, 'denied'));
  assert.doesNotThrow(() => expectResult({ data: null, error: { code: '23505' } }, 'duplicate'));
  for (const result of [{ data: [], error: null }, { data: null, error: { code: 'FETCH_ERROR', message: 'secret-token' } }]) {
    assert.throws(() => expectResult(result, 'denied'), error => !error.message.includes('secret-token'));
  }
});

test('matriz rechaza identidad no autorizada antes de cualquier consulta o escritura', async () => {
  let calls = 0;
  const clients = Object.fromEntries(Object.keys(ids).map(name => [name, {
    auth: { getUser: async () => ({ data: { user: { id: ids.admin, email_confirmed_at: 'confirmed' } }, error: null }) },
    from: () => { calls++; throw new Error('must not query'); },
  }]));
  await assert.rejects(runMatrix({ config: valid, clients, checkpoint: async () => {} }), /identidad/);
  assert.equal(calls, 0);
});

test('CLI sin autorización no abre sesiones ni emite secretos del entorno', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-authenticated-catalog.mjs'], {
    encoding: 'utf8', env: { ...process.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'do-not-print-this' },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /NO EJECUTADO/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('do-not-print-this'));
});

test('éxito inesperado de una escritura denegada se registra y detiene la matriz sin filtrar respuesta', async () => {
  const snapshots = [];
  const unexpectedId = '00000000-0000-4000-8000-100000000001';
  const clients = Object.fromEntries(Object.keys(ids).map(name => [name, {
    auth: { getUser: async () => ({ data: { user: { id: ids[name], email_confirmed_at: 'confirmed' } }, error: null }) },
    from: table => {
      let column, value, inserting = false;
      const query = {
        select: () => query, in: () => query, ilike: () => query,
        eq: (key, val) => { if (key === 'id' || key === 'user_id') { column = key; value = val; } return query; },
        insert: () => { inserting = true; return query; },
        then: (accept, reject) => {
          let data = [];
          if (table === 'user_roles') data = [{ user_id: ids[name], role: name.startsWith('student') ? 'student' : name }];
          if (table === 'profiles' && column === 'id' && value === ids[name]) data = [{ id: ids[name] }];
          if (['curricula', 'elective_areas'].includes(table)) data = [{ id: value }];
          if (inserting) data = [{ id: unexpectedId, access_token: 'secret-from-unexpected-response' }];
          return Promise.resolve({ data, error: null }).then(accept, reject);
        },
      };
      return query;
    },
  }]));
  await assert.rejects(runMatrix({ config: valid, clients, checkpoint: async manifest => snapshots.push(structuredClone(manifest)) }), /Resultado inesperado/);
  assert.ok(snapshots.some(s => s.intents.some(i => !i.completed)), 'intent written before mutation');
  assert.deepEqual(snapshots.at(-1).courseIds, [unexpectedId]);
  assert.equal(snapshots.at(-1).intents.length, 1, 'stop at first unexpected write');
  assert.ok(!JSON.stringify(snapshots).includes('secret-from-unexpected-response'));
});

function finalState() {
  const plan = makePlan(valid.runId);
  const direct = { id: 'direct', name: plan.proposals[0].name, status: 'active' };
  const edited = { ...direct, name: `${direct.name} Editado` };
  const archived = { ...edited, status: 'archived' };
  const approved = { id: 'approved', name: plan.proposals[1].name, status: 'active' };
  const approvedArchived = { ...approved, status: 'archived' };
  const event = (after, before, actor) => ({ id: randomId(), course_id: after.id, action: before ? 'updated' : 'created', actor_id: actor, before_data: before, after_data: after });
  let index = 0;
  function randomId() { return `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`; }
  return { config: valid, plan, courseId: direct.id, approvedId: approved.id,
    courses: [archived, approvedArchived],
    events: [event(direct, null, ids.admin), event(edited, direct, ids.admin), event(archived, edited, ids.admin), event(edited, archived, ids.admin), event(archived, edited, ids.admin), event(approved, null, ids.moderator), event(approvedArchived, approved, ids.admin)] };
}

test('estado final exige los dos ramos archivados, no basta con PATCH sin error', () => {
  const state = finalState();
  assert.doesNotThrow(() => verifyFinalState(state));
  state.courses[1] = { ...state.courses[1], status: 'active' };
  assert.throws(() => verifyFinalState(state), /archivados/);
  state.courses.pop();
  assert.throws(() => verifyFinalState(state), /archivados/);
});

test('auditoría final exige siete eventos exactos, actores y transiciones de archivo/restauración', () => {
  const state = finalState();
  state.events = state.events.filter(e => e.action === 'created' || e.before_data?.name !== e.after_data?.name);
  assert.throws(() => verifyFinalState(state), /auditoria/);
  for (const mutate of [
    s => { s.events[3].actor_id = ids.studentA; },
    s => { s.events[3].before_data = { ...s.events[3].before_data, status: 'active' }; },
    s => { s.events[3].id = s.events[0].id; },
  ]) { const candidate = finalState(); mutate(candidate); assert.throws(() => verifyFinalState(candidate), /auditoria/); }
});
