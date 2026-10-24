/** Opt-in PostgREST QA. Importing or invoking without --execute never contacts Supabase. */
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const roles = { studentA: 'student', studentB: 'student', moderator: 'moderator', admin: 'admin' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ensure = (condition, label) => { if (!condition) throw new Error(label); };

export function validateConfig(config) {
  const url = new URL(config.url);
  ensure(/^[a-z0-9-]+$/.test(config.project) && url.origin === `https://${config.project}.supabase.co`
    && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password, 'Proyecto no autorizado');
  let publicKey = config.key?.startsWith('sb_publishable_');
  if (!publicKey && config.key?.split('.').length === 3) {
    try { publicKey = JSON.parse(Buffer.from(config.key.split('.')[1], 'base64url')).role === 'anon'; } catch { /* Reject malformed keys. */ }
  }
  ensure(publicKey, 'Solo clave pública publishable/anon; nunca service_role');
  ensure(/^qa-\d{8}-[0-9a-f]{8}$/.test(config.runId), 'run-id QA no válido');
  const ids = Object.keys(roles).map(role => config.accounts?.[role]);
  ensure(Object.keys(config.accounts ?? {}).length === 4 && ids.every(id => typeof id === 'string' && uuid.test(id)) && new Set(ids).size === 4, 'Se requieren cuatro UUID de cuentas QA distintas, sin otros campos');
}

export function makePlan(runId) {
  ensure(/^qa-\d{8}-[0-9a-f]{8}$/.test(runId), 'run-id QA no válido');
  const proposal = (label, suffix, elective = false) => ({
    name: `QA ${runId} ${label}`, code: `QA-${runId.slice(-8).toUpperCase()}-${suffix}`,
    description: `QA aislada ${runId}`, curriculum_id: 'plan-ilustrativo',
    kind: elective ? 'elective' : 'regular', curricular_semester: elective ? null : 12,
    elective_area_id: elective ? 'otro' : null,
  });
  return { runId, proposals: [proposal('Administracion', 'ADM'), proposal('Aprobacion', 'APR'), proposal('Rechazo', 'REJ', true), proposal('Duplicado', 'DUP')],
    requestIds: Array.from({ length: 5 }, () => randomUUID()) };
}

export function expectResult(result, kind = 'success') {
  const code = result.error?.code;
  const expected = { denied: '42501', duplicate: '23505', resolved: '55000' }[kind];
  ensure(expected ? code === expected : !result.error, `Resultado inesperado (${kind}); detalles remotos omitidos`);
  return result.data;
}

export function verifyFinalState({ config, plan, courseId, approvedId, courses, events }) {
  ensure(courses.length === 2 && new Set(courses.map(c => c.id)).size === 2
    && courses.every(c => [courseId, approvedId].includes(c.id) && c.status === 'archived'), 'Ramos QA no confirmados archivados');
  const original = plan.proposals[0].name, edited = `${original} Editado`, approved = plan.proposals[1].name;
  const admin = config.accounts.admin, moderator = config.accounts.moderator;
  const expected = [
    [courseId, admin, 'created', null, null, original, 'active'],
    [courseId, admin, 'updated', original, 'active', edited, 'active'],
    [courseId, admin, 'updated', edited, 'active', edited, 'archived'],
    [courseId, admin, 'updated', edited, 'archived', edited, 'active'],
    [courseId, admin, 'updated', edited, 'active', edited, 'archived'],
    [approvedId, moderator, 'created', null, null, approved, 'active'],
    [approvedId, admin, 'updated', approved, 'active', approved, 'archived'],
  ].map(row => JSON.stringify(row)).sort();
  ensure(events.length === 7 && new Set(events.map(e => e.id)).size === 7
    && events.every(e => uuid.test(e.id) && e.after_data?.id === e.course_id
      && (e.before_data === null || e.before_data?.id === e.course_id)), 'IDs de auditoria no válidos');
  const actual = events.map(e => JSON.stringify([e.course_id, e.actor_id, e.action,
    e.before_data?.name ?? null, e.before_data?.status ?? null, e.after_data?.name, e.after_data?.status])).sort();
  ensure(actual.every((value, index) => value === expected[index]), 'Transiciones de auditoria incompletas o inesperadas');
}

export async function runMatrix({ config, clients, checkpoint, plan = makePlan(config.runId) }) {
  validateConfig(config);
  ensure(plan.runId === config.runId, 'Plan ajeno');
  const manifest = { schema: 1, status: 'RUNNING', project: config.project, runId: config.runId, started: new Date().toISOString(),
    accounts: config.accounts, plan, courseIds: [], requestIds: [], adminEventIds: [], reviewEventIds: [], checks: [], intents: [] };
  const save = () => checkpoint(manifest);
  const check = async (label, condition) => { ensure(condition, label); manifest.checks.push(label); await save(); };
  const rows = async query => { const data = expectResult(await query); ensure(Array.isArray(data), 'Respuesta no es lista'); return data; };
  const account = name => config.accounts[name];
  // Verify every identity before even reading another account's profile.
  for (const name of Object.keys(roles)) {
    const result = await clients[name].auth.getUser();
    ensure(!result.error && result.data.user?.id === account(name) && result.data.user.email_confirmed_at, `identidad QA no autorizada: ${name}`);
  }
  await save();
  for (const name of Object.keys(roles)) {
    const own = await rows(clients[name].from('user_roles').select('user_id,role').eq('user_id', account(name)));
    await check(`rol ${name}`, own.length === 1 && own[0].role === roles[name]);
    const peer = name === 'studentA' ? 'studentB' : 'studentA';
    await check(`perfil propio ${name}`, (await rows(clients[name].from('profiles').select('id').eq('id', account(name)))).length === 1);
    await check(`perfil ajeno oculto ${name}`, (await rows(clients[name].from('profiles').select('id').eq('id', account(peer)))).length === 0);
  }
  const admin = clients.admin, moderator = clients.moderator;
  await check('cuentas QA sin solicitudes preexistentes', (await rows(admin.from('course_creation_requests').select('id').in('requested_by', Object.values(config.accounts)))).length === 0);
  await check('prefijo QA libre', (await rows(admin.from('courses').select('id').ilike('name', `QA ${config.runId} %`))).length === 0);
  await check('plan activo', (await rows(admin.from('curricula').select('id').eq('id', 'plan-ilustrativo').eq('status', 'active'))).length === 1);
  await check('area activa', (await rows(admin.from('elective_areas').select('id').eq('id', 'otro').eq('status', 'active'))).length === 1);

  // Persist intent BEFORE a write, including writes expected to fail. Lost responses need reconciliation, never blind retries.
  async function write(label, table, operation, kind = 'success') {
    manifest.intents.push({ label, table, at: new Date().toISOString(), completed: false }); await save();
    const result = await operation();
    const intent = manifest.intents.at(-1);
    intent.completed = true;
    intent.sqlstate = /^[0-9A-Z]{5}$/.test(result.error?.code ?? '') ? result.error.code : null;
    // Record any unexpected successful insertion before an assertion can stop QA.
    if (Array.isArray(result.data) && ['courses', 'course_creation_requests'].includes(table)) {
      const target = table === 'courses' ? manifest.courseIds : manifest.requestIds;
      for (const row of result.data) if (typeof row.id === 'string' && !target.includes(row.id)) target.push(row.id);
    }
    if (table === 'rpc' && typeof result.data === 'string' && uuid.test(result.data) && !manifest.courseIds.includes(result.data)) manifest.courseIds.push(result.data);
    await save();
    return expectResult(result, kind);
  }
  const [direct, approve, reject] = plan.proposals;
  for (const name of ['studentA', 'studentB', 'moderator']) {
    await write(`insert courses denegado ${name}`, 'courses', () => clients[name].from('courses').insert(direct).select('id'), 'denied');
  }
  const created = await write('admin crea regular', 'courses', () => admin.from('courses').insert(direct).select('id,slug,name,version'));
  ensure(created?.length === 1, 'Admin no creó exactamente un ramo');
  const course = created[0];
  await check('ramo publico activo', (await rows(clients.studentA.from('courses').select('id').eq('id', course.id))).length === 1);
  for (const name of ['studentA', 'moderator']) {
    const data = await write(`update courses sin permiso ${name}`, 'courses', () => clients[name].from('courses').update({ description: `QA ${config.runId} intento denegado` }).eq('id', course.id).select('id'));
    await check(`RLS update cero filas ${name}`, data.length === 0);
    const unchanged = await rows(admin.from('courses').select('version,description').eq('id', course.id));
    await check(`sin cambio ${name}`, unchanged[0]?.version === course.version && unchanged[0]?.description === direct.description);
  }
  const rename = { name: `${direct.name} Editado`, kind: 'elective', curricular_semester: null, elective_area_id: 'otro' };
  let changed = await write('admin reclasifica conservando identidad', 'courses', () => admin.from('courses').update(rename).eq('id', course.id).eq('version', course.version).select('id,slug,name,version'));
  await check('identidad y version', changed.length === 1 && changed[0].slug === course.slug && changed[0].version === course.version + 1);
  await check('version obsoleta no modifica', (await write('admin intenta version obsoleta', 'courses', () => admin.from('courses').update({ description: 'QA version obsoleta' }).eq('id', course.id).eq('version', course.version).select('id'))).length === 0);
  await write('admin archiva', 'courses', () => admin.from('courses').update({ status: 'archived' }).eq('id', course.id).select('id'));
  for (const name of ['studentA', 'moderator']) await check(`archivado oculto ${name}`, (await rows(clients[name].from('courses').select('id').eq('id', course.id))).length === 0);
  await check('admin conserva archivado', (await rows(admin.from('courses').select('id').eq('id', course.id))).length === 1);
  await write('nombre normalizado duplicado archivado', 'courses', () => admin.from('courses').insert({ ...direct, name: rename.name.toUpperCase(), code: null }).select('id'), 'duplicate');
  await write('codigo normalizado duplicado archivado', 'courses', () => admin.from('courses').insert({ ...plan.proposals[3], code: ` ${direct.code.toLowerCase()} ` }).select('id'), 'duplicate');
  await write('admin restaura', 'courses', () => admin.from('courses').update({ status: 'active' }).eq('id', course.id).select('id'));
  await write('identidad slug inmutable por grants', 'courses', () => admin.from('courses').update({ slug: `qa-${config.runId}` }).eq('id', course.id).select('id'), 'denied');
  await write('delete courses denegado incluso admin', 'courses', () => admin.from('courses').delete().eq('id', course.id).select('id'), 'denied');

  const submit = (who, index, proposal, extra = {}) => write(`solicitud ${index} ${who}`, 'course_creation_requests', () => clients[who].from('course_creation_requests')
    .insert({ ...proposal, id: plan.requestIds[index], justification: `QA ${config.runId} prueba controlada`, ...extra }).select('id,requested_by,status'));
  await submit('studentA', 0, approve);
  await submit('studentB', 1, reject);
  // A duplicate course proposal is legal to submit; approval must roll back atomically.
  await submit('studentA', 2, { ...direct, name: rename.name });
  await write('solicitud pendiente duplicada', 'course_creation_requests', () => clients.studentA.from('course_creation_requests').insert({ ...approve, id: plan.requestIds[3], justification: `QA ${config.runId} duplicado pendiente` }).select('id'), 'duplicate');
  await write('suplantar solicitante denegado por grants', 'course_creation_requests', () => clients.studentA.from('course_creation_requests').insert({ ...reject, id: plan.requestIds[4], requested_by: account('studentB'), justification: `QA ${config.runId} intento suplantacion` }).select('id'), 'denied');
  for (const [who, ownIndex, otherIndex] of [['studentA', 0, 1], ['studentB', 1, 0]]) {
    const own = await rows(clients[who].from('course_creation_requests').select('id,requested_by,status').eq('id', plan.requestIds[ownIndex]));
    await check(`solicitud propia ${who}`, own.length === 1 && own[0].requested_by === account(who) && own[0].status === 'pending');
    await check(`solicitud ajena oculta ${who}`, (await rows(clients[who].from('course_creation_requests').select('id').eq('id', plan.requestIds[otherIndex]))).length === 0);
  }
  for (const [name, client] of [['moderator', moderator], ['admin', admin]]) await check(`cola revisor ${name}`, (await rows(client.from('course_creation_requests').select('id').in('id', plan.requestIds.slice(0, 3)))).length === 3);
  const review = (client, index, decision) => client.rpc('review_course_request', { request_id: plan.requestIds[index], decision, notes: `QA ${config.runId} ${decision}` });
  await write('student no revisa solicitud ajena', 'rpc', () => review(clients.studentA, 1, 'approved'), 'denied');
  await write('student no revisa solicitud propia', 'rpc', () => review(clients.studentA, 0, 'approved'), 'denied');
  const approvedId = await write('moderador aprueba original', 'rpc', () => review(moderator, 0, 'approved'));
  ensure(typeof approvedId === 'string' && uuid.test(approvedId), 'RPC no retornó ID de ramo');
  await save();
  await write('moderador rechaza', 'rpc', () => review(moderator, 1, 'rejected'));
  await write('segunda resolucion bloqueada', 'rpc', () => review(admin, 0, 'rejected'), 'resolved');
  await write('aprobar duplicado revierte transaccion', 'rpc', () => review(moderator, 2, 'approved'), 'duplicate');
  const pending = await rows(admin.from('course_creation_requests').select('status,reviewed_by,resulting_course_id').eq('id', plan.requestIds[2]));
  await check('duplicado sigue pendiente sin revisor ni ramo', pending.length === 1 && pending[0].status === 'pending' && pending[0].reviewed_by === null && pending[0].resulting_course_id === null);
  await check('duplicado sin evento', (await rows(admin.from('course_request_review_events').select('id').eq('request_id', plan.requestIds[2]))).length === 0);
  await write('admin rechaza duplicado pendiente', 'rpc', () => review(admin, 2, 'rejected'));

  const decisions = await rows(admin.from('course_creation_requests').select('id,status,reviewed_by,reviewed_at,resulting_course_id').in('id', plan.requestIds.slice(0, 3)));
  for (const [index, reviewer, status] of [[0, 'moderator', 'approved'], [1, 'moderator', 'rejected'], [2, 'admin', 'rejected']]) {
    const row = decisions.find(r => r.id === plan.requestIds[index]);
    await check(`resolucion persistida ${index}`, row?.status === status && row.reviewed_by === account(reviewer) && !!row.reviewed_at && row.resulting_course_id === (index === 0 ? approvedId : null));
  }
  const reviews = await rows(admin.from('course_request_review_events').select('id,request_id,actor_id,action,resulting_course_id').in('request_id', plan.requestIds.slice(0, 3)));
  manifest.reviewEventIds = reviews.map(r => r.id); await save();
  await check('tres eventos de revision exactos', reviews.length === 3 && new Set(reviews.map(r => r.request_id)).size === 3);
  for (const row of decisions) await check(`auditoria revision ${plan.requestIds.indexOf(row.id)}`, reviews.some(event => event.request_id === row.id && event.actor_id === row.reviewed_by && event.action === row.status && event.resulting_course_id === row.resulting_course_id));
  await check('evento propio visible studentA', (await rows(clients.studentA.from('course_request_review_events').select('id').eq('request_id', plan.requestIds[0]))).length === 1);
  await check('evento ajeno oculto studentB', (await rows(clients.studentB.from('course_request_review_events').select('id').eq('request_id', plan.requestIds[0]))).length === 0);
  await check('revision visible moderator', (await rows(moderator.from('course_request_review_events').select('id').in('request_id', plan.requestIds.slice(0, 3)))).length === 3);
  for (const name of ['studentA', 'moderator']) await check(`auditoria admin oculta ${name}`, (await rows(clients[name].from('course_admin_events').select('id').in('course_id', manifest.courseIds))).length === 0);
  await write('no reescritura directa solicitud', 'course_creation_requests', () => clients.studentA.from('course_creation_requests').update({ status: 'approved' }).eq('id', plan.requestIds[1]).select('id'), 'denied');
  await write('no borrar auditoria', 'audit', () => admin.from('course_request_review_events').delete().eq('id', manifest.reviewEventIds[0]).select('id'), 'denied');
  await write('no alterar auditoria', 'audit', () => admin.from('course_admin_events').update({ action: 'updated' }).eq('course_id', course.id).select('id'), 'denied');
  // Leave no active QA course after success. Physical cleanup is a separate authorized maintenance step.
  for (const id of manifest.courseIds) {
    const archived = await write('archivar ramo QA al terminar', 'courses', () => admin.from('courses').update({ status: 'archived' }).eq('id', id).select('id'));
    await check('archivo afecta exactamente ramo QA', archived?.length === 1 && archived[0].id === id);
  }
  const finalCourses = await rows(admin.from('courses').select('id,status').in('id', manifest.courseIds));
  const events = await rows(admin.from('course_admin_events').select('id,course_id,actor_id,action,before_data,after_data').in('course_id', manifest.courseIds));
  manifest.adminEventIds = events.map(r => r.id); await save();
  verifyFinalState({ config, plan, courseId: course.id, approvedId, courses: finalCourses, events });
  await check('dos ramos archivados y siete eventos exactos con actores y transiciones', true);
  manifest.status = 'PASS'; manifest.finished = new Date().toISOString(); await save();
  return manifest;
}

// readline's terminal editing writes only to the muted stream, never to stdout.
export function hiddenPrompt(label) {
  ensure(process.stdin.isTTY && process.stdout.isTTY, 'Se requiere terminal interactivo sin captura de entrada');
  process.stdout.write(`${label}: `);
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true, historySize: 0 });
  return new Promise((accept, reject) => {
    rl.once('SIGINT', () => { rl.close(); process.stdout.write('\n'); reject(new Error('Cancelado')); });
    rl.question('', value => { rl.close(); process.stdout.write('\n'); accept(value); });
  });
}

async function main() {
  const { values } = parseArgs({ options: { execute: { type: 'boolean' }, project: { type: 'string' }, 'run-id': { type: 'string' }, accounts: { type: 'string' } } });
  if (!values.execute) { console.log('NO EJECUTADO. Procedimiento: docs/QA_SUPABASE_AUTENTICADO.md. Requiere autorización expresa antes de --execute.'); return; }
  const config = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    project: values.project, runId: values['run-id'], accounts: JSON.parse(await readFile(values.accounts, 'utf8')) };
  validateConfig(config);
  ensure(process.stdin.isTTY && process.stdout.isTTY, 'No ejecutar con redirecciones ni grabación de terminal');
  const confirmation = await hiddenPrompt(`Escribe AUTORIZO ${config.project} ${config.runId} tras recibir autorización expresa`);
  ensure(confirmation === `AUTORIZO ${config.project} ${config.runId}`, 'Sin confirmación');
  const dir = resolve('/tmp/opencode', `wiki-auth-qa-${config.runId}`);
  // Exclusive directory: never overwrite a prior run or silently retry mutations.
  await mkdir(dir, { mode: 0o700 });
  const checkpoint = async manifest => {
    const temporary = resolve(dir, 'manifest.tmp');
    const file = await open(temporary, 'w', 0o600);
    try { await file.writeFile(JSON.stringify(manifest, null, 2)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, resolve(dir, 'manifest.json'));
  };
  const clients = {};
  const plan = makePlan(config.runId);
  await checkpoint({ status: 'PREPARING', project: config.project, runId: config.runId, accounts: config.accounts, plan });
  try {
    for (const name of Object.keys(roles)) {
      const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000), redirect: 'error' }) } });
      clients[name] = client;
      const email = await hiddenPrompt(`Correo de cuenta QA ${name} (oculto)`);
      let password = await hiddenPrompt(`Contraseña QA ${name} (oculta)`);
      const { error } = await client.auth.signInWithPassword({ email, password }); password = '';
      ensure(!error, `Login QA falló: ${name}; detalles omitidos`);
    }
    const result = await runMatrix({ config, clients, checkpoint, plan });
    console.log(`PASS: ${result.checks.length} comprobaciones. Manifiesto sin secretos: ${dir}/manifest.json`);
  } finally {
    // Local sign-out revokes this session only, never other users' sessions.
    for (const client of Object.values(clients)) { try { await client.auth.signOut({ scope: 'local' }); } catch { /* No remote error bodies in logs. */ } }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('QA detenida. No reintentar con el mismo run-id. Revisar el manifiesto y reconciliar intenciones antes de limpiar. Detalles sensibles omitidos.'); process.exitCode = 1; });
}
