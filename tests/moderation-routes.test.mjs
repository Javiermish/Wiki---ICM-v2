import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.WIKI_TEST_BASE_URL;
const privateMarkers = ["MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "privado-pendiente.pdf", "privado-rechazado.pdf", "originalFilename", "submittedAt"];

test("moderación HTTP requiere sesión autorizada y no expone IDs de revisión", { skip: !base }, async (t) => {
  const request = (path, headers) => fetch(new URL(path, base), { headers, redirect: "manual", signal: AbortSignal.timeout(20000) });
  await t.test("acceso directo anónimo bloqueado, sin colas serializadas", async () => {
    const response = await request("/moderacion");
    assert.ok([200, 307].includes(response.status));
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    const html = await response.text();
    // Cache Components can stream the public shell before the server redirect.
    if (response.status === 307) assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
    else assert.match(html, /id="__next-page-redirect"[^>]*content="1;url=\/login\?next=%2Fmoderacion"/);
    for (const marker of ['id="materiales-revision"', 'id="solicitudes"', 'id="reportes"']) assert.ok(!html.includes(marker));
    for (const marker of privateMarkers) assert.ok(!html.includes(marker), marker);
    assert.ok(!/<a[^>]+href="\/materiales\/synthetic-/i.test(html));
    const scripts = new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")));
    for (const script of scripts) {
      assert.equal(new URL(script, base).origin, new URL(base).origin);
      const source = await (await request(script)).text();
      for (const marker of privateMarkers) assert.ok(!source.includes(marker), `${script}: ${marker}`);
    }
  });
  await t.test("IDs de revisión no son fichas ni archivos públicos", async () => {
    for (const id of ["synthetic-review-material-1", "synthetic-review-material-3", "synthetic-review-material-4", "synthetic-course-request-1"]) {
      for (const path of [`/materiales/${id}`, `/materiales/${id}/archivo`, `/materiales/${id}/archivo?descargar=1`]) assert.equal((await request(path)).status, 404, path);
    }
  });
});
