import assert from "node:assert/strict";
import test from "node:test";

// Opt-in against an already-running loopback server; no users or remote writes.
const base = process.env.WIKI_TEST_BASE_URL;
const privateMarkers = ["MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "privado-pendiente.pdf", "privado-rechazado.pdf", "originalFilename", "submittedAt"];
const unavailable = "Catálogo temporalmente no disponible";
const anonymousId = "11111111-1111-4111-8111-111111111111";

function publicOnly(body, label) {
  // A requested ID reflected by the router is not metadata read from the catalog.
  for (const marker of privateMarkers.filter(marker => !label.includes(marker))) assert.ok(!body.includes(marker), `${label}: private metadata ${marker}`);
  assert.doesNotMatch(body, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}/, `${label}: secret material`);
  for (const token of body.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    let payload;
    try { payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); } catch { continue; }
    assert.notEqual(payload.role, "service_role", `${label}: service-role JWT`);
  }
}

async function request(path, init = {}) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Use an existing loopback server");
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), redirect: "manual", ...init });
  return { response, body: await response.text() };
}

async function page(path, status = 200) {
  const result = await request(path);
  assert.equal(result.response.status, status, path);
  assert.match(result.body, /lang="es"/);
  assert.match(result.body, /id="contenido"/);
  publicOnly(result.body, path);
  return result.body;
}

function assertLoginRedirect({ response, body }, label) {
  // Suspense can commit HTTP 200 before Next emits its redirect in HTML/Flight.
  assert.ok([200, 303, 307, 308].includes(response.status), `${label}: redirect transport`);
  const destination = response.headers.get("location") ?? body.match(/NEXT_REDIRECT;(?:replace|push);([^;]+);(?:303|307|308);/)?.[1];
  assert.ok(destination, `${label}: explicit server redirect, not just a login link`);
  const login = new URL(destination.replaceAll("&amp;", "&"), base);
  assert.equal(login.origin, new URL(base).origin);
  assert.equal(login.pathname, "/login");
  assert.ok(login.searchParams.get("next")?.startsWith("/") && !login.searchParams.get("next").startsWith("//"), "Safe local return destination");
  publicOnly(body, label);
  assert.doesNotMatch(body, /id=\\?"contribution-(?:form|file|courseId|academicYear|authorization)\\?"|type=\\?"file\\?"/, `${label}: no contribution form before authentication`);
  assert.doesNotMatch(body, /Simulación completada|Comparte lo que te ayudó a aprender/, `${label}: no public demo/real form`);
}

test("aportes: cuenta verificada requerida y rechazo anónimo sin mutaciones", { skip: !base }, async (t) => {
  await t.test("HTML: visitante redirige aun con parámetros de ramo/rol", async () => {
    for (const query of ["", "?ramo=calculo-i", "?ramo=no-existe", "?ramo=", "?ramo=calculo-i&ramo=algebra-i", "?ramo=__proto__", "?ramo=calculo-i&academicYear=2099&role=admin&status=approved"]) {
      assertLoginRedirect(await request(`/aportar${query}`), query || "/aportar");
    }
  });

  await t.test("RSC: misma protección, sin formulario ni metadatos privados", async () => {
    // Next may canonicalize a bare RSC request to its _rsc URL first.
    const result = await request("/aportar?ramo=calculo-i&_rsc", { headers: { RSC: "1" } });
    if (result.response.status === 200) assert.match(result.response.headers.get("content-type"), /text\/x-component/);
    assertLoginRedirect(result, "RSC /aportar");
  });

  await t.test("POST sin sesión exige correo verificado antes de validar/subir", async () => {
    const { response, body } = await request("/api/materiales", { method: "POST", headers: { Origin: new URL(base).origin, "Content-Type": "application/json" }, body: JSON.stringify({ role: "admin", status: "approved" }) });
    assert.equal(response.status, 401);
    assert.match(body, /correo verificado/i);
    assert.match(response.headers.get("cache-control"), /no-store/);
    publicOnly(body, "POST anónimo");
  });

  await t.test("CSRF: origen ajeno, null o ausente denegados", async () => {
    for (const origin of [undefined, "null", "https://attacker.invalid"]) {
      const { response, body } = await request("/api/materiales", { method: "POST", headers: origin === undefined ? {} : { Origin: origin } });
      assert.equal(response.status, 403, String(origin));
      assert.match(body, /Origen no permitido/);
      publicOnly(body, "CSRF");
    }
  });

  await t.test("archivo UUID anónimo devuelve 404, no URL firmada ni descarga", async () => {
    for (const suffix of ["", "?descargar=1"]) {
      const { response, body } = await request(`/api/materiales/${anonymousId}/archivo${suffix}`);
      assert.equal(response.status, 404);
      assert.ok(!response.headers.has("content-disposition"));
      assert.ok(!response.headers.has("location"));
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.doesNotMatch(body, /https?:\/\/|X-Amz-|signature=/i);
      publicOnly(body, "archivo anónimo");
    }
  });

  await t.test("HTML/RSC y bundles entregados al visitante no contienen secretos", async () => {
    const html = await page("/login?next=%2Faportar");
    const blocked = await request("/aportar?ramo=calculo-i");
    publicOnly(blocked.body, "aportar HTML");
    const scripts = new Set([...`${html}${blocked.body}`.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")));
    assert.ok(scripts.size > 0, "Actual client bundles inspected");
    for (const script of scripts) {
      assert.equal(new URL(script, base).origin, new URL(base).origin);
      const { response, body } = await request(script);
      assert.equal(response.status, 200, script);
      publicOnly(body, script);
    }
  });

  const home = await page("/");
  await t.test("cabecera mantiene CTA protegido y error de catálogo explícito", async () => {
    assert.ok(home.match(/<header\b[\s\S]*?<\/header>/)?.[0].includes('href="/aportar"'));
    if (home.includes(unavailable)) {
      assert.match(home, /No se muestran ramos de demostración como reemplazo/);
      assert.match(home, /Reintentar carga/);
      assert.ok(!/<a\b[^>]*href="\/materiales\/demo-/.test(home), "Outage must not silently substitute fixtures");
      t.diagnostic("Catálogo remoto no disponible: se comprobó el error, no un catálogo operativo.");
    }
  });

  await t.test("catálogo/lector DEMO: regresiones con fixtures disponibles", async (t) => {
    if (home.includes(unavailable)) return t.skip("Migración/conexión remota no disponible; no se ejercitaron filtros, CTA de ramo ni lector.");
    if (!/href="\/materiales\/demo-/.test(home)) return t.skip("El catálogo actual no expone fixtures DEMO; no se inventan IDs persistentes.");
    for (const [path, expected] of [
      ["/semestres/1", "Cálculo I"], ["/ramos/geometria", "Geometría"],
      ["/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2", "Certamen 2 - 2024-2"],
      ["/materiales/demo-certamen-calculo-2", "Certamen 2 - 2024-2"],
      ["/materiales/demo-listado-algebra-1", "Archivo no disponible"],
    ]) assert.ok((await page(path)).includes(expected), `${path}: ${expected}`);
    for (const slug of ["calculo-i", "geometria"]) assert.ok((await page(`/ramos/${slug}`)).includes(`href="/aportar?ramo=${slug}"`));
  });

  await t.test("materiales privados y desconocidos siguen inaccesibles sin depender del catálogo DEMO", async () => {
    for (const id of ["demo-pending-calculo", "demo-rejected-calculo", "no-existe"]) {
      const { response, body } = await request(`/materiales/${id}`);
      assert.equal(response.status, 404, `${id}: not found`);
      publicOnly(body, `/materiales/${id}`);
      for (const suffix of ["/archivo", "/archivo?descargar=1"]) assert.equal((await request(`/materiales/${id}${suffix}`)).response.status, 404);
    }
  });

  await t.test("formulario real con cuenta verificada", (t) => {
    t.skip("Sin identidad externa autorizada: no hay ruta DEMO pública. No se prueban validación UI, preselección, envío, progreso ni moderación reales; helper XHR cubierto por persistent-contributions-ui.test.mjs.");
  });
});
