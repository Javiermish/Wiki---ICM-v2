import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.WIKI_TEST_BASE_URL;
const privateMarkers = ["MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "privado-pendiente.pdf", "privado-rechazado.pdf", "originalFilename", "submittedAt"];

test("moderación HTTP es demo pública, tres colas aisladas y ningún endpoint público para sus IDs", { skip: !base }, async (t) => {
  const request = (path, headers) => fetch(new URL(path, base), { headers, redirect: "manual", signal: AbortSignal.timeout(20000) });
  await t.test("ruta, formularios progresivos y aislamiento HTML/chunks", async () => {
    const response = await request("/moderacion");
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const text of ["Demostración pública", "sin backend", "sin login", "se pierden al recargar", "no publica", 'id="materiales-revision"', 'id="solicitudes"', 'id="reportes"']) assert.ok(html.toLowerCase().includes(text.toLowerCase()), text);
    assert.match(html, /<fieldset\b[^>]*\bdisabled/);
    assert.match(html, /<noscript/);
    assert.match(html, /noindex, nofollow/);
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
