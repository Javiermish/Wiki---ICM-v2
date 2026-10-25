/** Read-only PostgREST double, never a replacement for SQL/RLS integration tests. */
import { createServer } from 'node:http';
import { demoCatalog } from '../../src/fixtures/catalog.ts';

export async function startCatalogFixture() {
  const requests = [];
  let unavailable = false;
  const courses = demoCatalog.courses.map(c => ({
    id: c.id, slug: c.slug, curriculum_id: c.curriculumId, name: c.name, code: c.code,
    description: c.description, kind: c.kind, curricular_semester: c.curricularSemester,
    elective_area_id: c.electiveAreaId, status: c.status, version: 1,
  }));
  const tables = { courses, elective_areas: demoCatalog.electiveAreas, public_materials: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ method: req.method, path: url.pathname });
    res.setHeader('Content-Type', 'application/json');
    const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { message: 'Read-only fixture' });
    if (url.pathname === '/auth/v1/user') return send(401, { message: 'No session', code: 'bad_jwt' });
    if (unavailable) return send(503, { message: 'Deliberate local catalog outage' });
    const table = url.pathname.replace('/rest/v1/', '');
    if (!Object.hasOwn(tables, table)) return send(404, { message: 'Unknown fixture endpoint' });
    let rows = tables[table];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
    }
    const order = url.searchParams.get('order')?.split(',').map(item => item.split('.')[0]);
    if (order) rows = [...rows].sort((a, b) => {
      for (const key of order) { const value = String(a[key]).localeCompare(String(b[key])); if (value) return value; }
      return 0;
    });
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? rows.length);
    rows = rows.slice(offset, offset + limit);
    const select = url.searchParams.get('select');
    if (select && select !== '*') rows = rows.map(row => Object.fromEntries(select.split(',').map(key => [key, row[key]])));
    if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      if (rows.length !== 1) return send(406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, message: 'JSON object requested, multiple (or no) rows returned' });
      return send(200, rows[0]);
    }
    send(200, rows);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests,
    setUnavailable(value) { unavailable = value; },
    close: () => new Promise(resolve => server.close(resolve)) };
}
