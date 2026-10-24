import assert from "node:assert/strict";
import test from "node:test";

// Opt-in: WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node --test tests/course-routes.test.mjs
// Read-only requests to the coordinator's server; no server/build lifecycle.
const base = process.env.WIKI_TEST_BASE_URL;
const privateMarkers = ["MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "privado-pendiente.pdf", "privado-rechazado.pdf", "originalFilename", "submittedAt"];
const newRoutes = ["/gestion/asignaturas", "/electivos", "/favoritos", "/semestres/5"];

async function request(path, options = {}) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Only an existing loopback fixture server is allowed");
  return fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(20000), ...options });
}

function noPrivateData(text, context) {
  for (const marker of privateMarkers.filter((marker) => !context.includes(marker))) {
    assert.ok(!text.includes(marker), `${context}: private metadata ${marker} must not reach the public response`);
  }
}

async function page(path, status = 200) {
  const response = await request(path);
  assert.equal(response.status, status, path);
  const html = await response.text();
  assert.match(html, /lang="es"/);
  assert.match(html, /id="contenido"/);
  noPrivateData(html, path);
  return html;
}

test("catálogo persistente y favoritos: HTTP con seed inicial aplicado", { skip: !base }, async (t) => {
  await t.test("gestión y solicitudes requieren sesión; no entregan formularios privados al visitante", async () => {
    for (const path of ["/admin/ramos", "/gestion/asignaturas"]) {
      const response = await request(path);
      const html = await response.text();
      assert.ok([200, 303, 307, 308].includes(response.status));
      const destination = response.headers.get("location") ?? html.match(/http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/i)?.[1];
      assert.ok(destination, "Debe haber una redirección ejecutable a login");
      const target = new URL(destination.replaceAll("&amp;", "&"), base);
      assert.equal(target.pathname, "/login");
      assert.equal(target.searchParams.get("next"), path);
      for (const field of ["course-name", "request-name", "request-justification"]) assert.ok(!html.includes(`id="${field}"`));
      noPrivateData(html, path);
    }
  });

  await t.test("electivos por área existen incluso sin documentos ni semestre curricular", async () => {
    const html = await page("/electivos");
    for (const area of ["Numérico", "Discreta", "Optimización", "Estadística", "Otro"]) assert.ok(html.includes(area), area);
    for (const slug of ["electivo-numerico", "electivo-discreta", "electivo-estadistica"]) assert.ok(html.includes(`href="/ramos/${slug}"`));
    assert.ok(!/Semestre curricular(?: <!-- -->| )null/i.test(html));
    const numeric = await page("/electivos?area=numerico");
    assert.ok(numeric.includes('href="/ramos/electivo-numerico"'));
    assert.ok(!numeric.includes('href="/ramos/electivo-discreta"'));
    for (const query of ["area=no-existe", "area=numerico&area=discreta", "q=uno&q=dos"]) {
      const invalid = await page(`/electivos?${query}`);
      assert.match(invalid, /role="alert"/);
      assert.equal((invalid.match(/<article\b/g) ?? []).length, 0);
    }
    const elective = await page("/ramos/electivo-numerico");
    assert.ok(elective.includes('href="/electivos?area=numerico"'));
    for (const category of ["Listados", "Apuntes", "Certámenes"]) assert.ok(elective.includes(category));
    assert.equal((elective.match(/<article\b/g) ?? []).length, 0);
    assert.ok(!elective.includes("semestres/null"));
  });

  await t.test("semestres canónicos 1–12 abiertos y slugs desconocidos ya no tienen excepción local", async () => {
    for (const semester of [5, 12]) {
      const html = await page(`/semestres/${semester}`);
      assert.ok(html.includes(`Semestre curricular ${semester}`));
      assert.match(html, /Aún no hay ramos de ejemplo/);
    }
    for (const path of ["/ramos/no-existe", "/ramos/local-", "/ramos/local-qa-course-unavailable"]) {
      const response = await request(path);
      const html = await response.text();
      assert.ok([200, 404].includes(response.status), "Next puede emitir notFound después de comenzar streaming");
      assert.ok(html.includes("No encontramos esta página"));
    }
    for (const path of ["/semestres/0", "/semestres/13", "/semestres/01", "/semestres/1.0", "/materiales/no-existe", "/materiales/demo-pending-calculo", "/materiales/demo-rejected-calculo"]) await page(path, 404);
  });

  await t.test("favoritos comienza vacío, es local y no solicita credenciales", async () => {
    const html = await page("/favoritos");
    assert.match(html, /Favoritos/);
    assert.match(html, /demo|demostración/i);
    assert.match(html, /memoria|pestaña|recargar/i);
    assert.equal((html.match(/<article\b/g) ?? []).length, 0);
    assert.ok(!/<input\b[^>]*type="(?:email|password)"/i.test(html));
  });

  await t.test("el buscador encuentra asignaturas sin inflar el número de materiales", async () => {
    const html = await page("/?q=Geometria");
    assert.match(html, /Asignaturas encontradas/);
    assert.ok(html.includes('href="/ramos/geometria"'));
    assert.equal((html.match(/<article\b/g) ?? []).length, 0);
    const calculus = await page("/?q=calculo");
    assert.equal((calculus.match(/<article\b/g) ?? []).length, 5);
  });

  await t.test("las rutas nuevas y ficha de material no filtran privados en HTML, RSC o JS", async () => {
    const scripts = new Set();
    for (const path of [...newRoutes, "/materiales/demo-certamen-calculo-2"]) {
      const html = await page(path);
      for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(match[1].replaceAll("&amp;", "&"));
      let response = await request(path, { headers: { RSC: "1" } });
      // Next canonicalizes fully-static RSC requests to a local ?_rsc URL.
      if (response.status === 307) {
        const location = new URL(response.headers.get("location"), base);
        assert.equal(location.origin, new URL(base).origin);
        assert.equal(location.pathname, new URL(path, base).pathname);
        assert.ok(location.searchParams.has("_rsc"));
        response = await request(location.href, { headers: { RSC: "1" } });
      }
      assert.equal(response.status, 200, `RSC ${path}`);
      assert.match(response.headers.get("content-type") ?? "", /text\/x-component/);
      noPrivateData(await response.text(), `RSC ${path}`);
    }
    assert.ok(scripts.size > 0, "Public scripts discovered from rendered pages");
    for (const script of scripts) {
      assert.equal(new URL(script, base).origin, new URL(base).origin, "Only inspect local public assets");
      const response = await request(script);
      assert.equal(response.status, 200, script);
      noPrivateData(await response.text(), script);
    }
  });
});
