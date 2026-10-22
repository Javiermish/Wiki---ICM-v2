import assert from "node:assert/strict";
import test from "node:test";

// Opt-in against the coordinator's already-running server. Never starts a server.
const base = process.env.WIKI_TEST_BASE_URL;
const privateMarkers = ["MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "privado-pendiente.pdf", "privado-rechazado.pdf", "originalFilename", "submittedAt"];
const selectedCourses = (html) => (html.match(/<input\b[^>]*>/g) ?? [])
  .filter((tag) => /\bname="courseId"/.test(tag) && /\bchecked(?:="[^"]*")?(?=[\s/>])/.test(tag))
  .map((tag) => tag.match(/\bvalue="([^"]*)"/)?.[1]);

async function page(path, status = 200) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Use an existing loopback fixture server");
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), redirect: "manual" });
  assert.equal(response.status, status, path);
  const html = await response.text();
  assert.match(html, /lang="es"/);
  assert.match(html, /id="contenido"/);
  for (const marker of privateMarkers.filter((marker) => !path.includes(marker))) {
    assert.ok(!html.includes(marker), `${path}: no private fixture metadata in HTML/RSC`);
  }
  return html;
}

test("aportes: HTTP local, parámetros, navegación y regresiones", { skip: !base }, async (t) => {
  await t.test("/aportar es público, explícitamente local y no presume permisos reales", async () => {
    const html = await page("/aportar");
    assert.match(html, /<h1\b/);
    assert.match(html, /id="contribution-form"/);
    assert.match(html, /simula|demostración/i);
    assert.match(html, /25 MiB/);
    assert.match(html, /PDF/);
    for (const id of ["course-search", "courseId", "category", "academicYear", "academicTerm", "instructor", "file", "authorization"]) {
      assert.ok(html.includes(`id="contribution-${id}"`), `control ${id}`);
    }
    assert.deepEqual(selectedCourses(html), []);
    assert.ok(!html.includes('id="contribution-documentNumber"'), "Number is introduced after choosing a category");
    assert.match(html, /<input\b[^>]*id="contribution-instructor"[^>]*maxLength="120"/i);
    assert.ok(!/<form\b[^>]*\b(?:action|method)="(?:https?:[^\"]*|post)"/i.test(html), "No submission endpoint or POST form");
    assert.ok(!/<input\b[^>]*type="(?:email|password)"/i.test(html), "No simulated credentials");
    assert.ok(!/<input\b[^>]*(?:name|id)="(?:role|status|uploadedBy|curricularSemester)"/.test(html));
    const permissions = (html.match(/<input\b[^>]*type="checkbox"[^>]*>/g) ?? []);
    assert.equal(permissions.length, 1, "Exactly one permission declaration");
    assert.ok(!/\bchecked(?:=|\s|>)/.test(permissions[0]), "Permission starts unchecked");
  });

  await t.test("SSR impide un GET accidental antes de hidratar y explica JavaScript desactivado", async () => {
    const html = await page("/aportar?ramo=calculo-i");
    // Suspense may stream the loading <main> before the actual form in a hidden
    // segment. Inspect the form's server-rendered main, not the loading shell.
    const main = [...html.matchAll(/<main\b[\s\S]*?<\/main>/g)].map((match) => match[0]).find((segment) => segment.includes('id="contribution-form"'));
    assert.ok(main, "Contribution main is server rendered");
    const rootFieldset = main.match(/<fieldset\b[^>]*>/)?.[0];
    assert.ok(rootFieldset && /\bdisabled(?:="[^"]*")?(?=[\s/>])/.test(rootFieldset), "Root fieldset is disabled in SSR");
    const form = main.match(/<form\b[^>]*id="contribution-form"[^>]*>/)?.[0];
    assert.ok(form && !/\b(?:action|method)=/.test(form), "No pre-hydration submission destination");
    const submit = (main.match(/<button\b[^>]*>/g) ?? []).find((tag) => /\btype="submit"/.test(tag) && /\bform="contribution-form"/.test(tag));
    assert.ok(submit && /\bdisabled(?:="[^"]*")?(?=[\s/>])/.test(submit), "Submit is explicitly disabled before hydration");
    const noscript = main.match(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/)?.[1];
    assert.ok(noscript && /JavaScript/.test(noscript) && /No se enviar/.test(noscript), "No-JS explanation promises no submission");
  });

  await t.test("ramo conocido se preselecciona; desconocidos, vacíos y repetidos no se infieren", async () => {
    for (const [query, expected] of [
      ["ramo=calculo-i", ["demo-calculo-i"]],
      ["ramo=algebra-i", ["demo-algebra-i"]],
      ["ramo=geometria", ["demo-geometria"]],
      ["ramo=no-existe", []], ["ramo=", []],
      ["ramo=calculo-i&ramo=algebra-i", []],
      ["ramo=calculo-i&ramo=calculo-i", []],
      ["ramo=__proto__", []],
    ]) {
      const html = await page(`/aportar?${query}`);
      assert.deepEqual(selectedCourses(html), expected, query);
      assert.match(html, /id="contribution-form"/);
    }
    const injected = await page("/aportar?ramo=calculo-i&academicYear=2099&academicTerm=2&role=admin&status=approved");
    assert.deepEqual(selectedCourses(injected), ["demo-calculo-i"]);
    const year = injected.match(/<input\b[^>]*id="contribution-academicYear"[^>]*>/)?.[0];
    assert.ok(year && !year.includes('value="2099"'), "URL does not fill academic metadata or roles");
  });

  await t.test("cabecera y CTA de portada/ramo enlazan al formulario real", async () => {
    for (const path of ["/", "/semestres/1", "/ramos/calculo-i", "/materiales/demo-certamen-calculo-2"]) {
      const html = await page(path);
      const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
      assert.ok(header?.includes('href="/aportar"'), `${path}: header offers /aportar`);
    }
    const home = await page("/");
    assert.match(home, /<main\b[\s\S]*href="\/aportar"/);
    for (const slug of ["calculo-i", "geometria"]) {
      assert.ok((await page(`/ramos/${slug}`)).includes(`href="/aportar?ramo=${slug}"`));
    }
  });

  await t.test("catálogo, lector y rutas fuera de alcance conservan sus respuestas", async () => {
    for (const [path, status, expected] of [
      ["/", 200, "Materiales para explorar"],
      ["/semestres/1", 200, "Cálculo I"],
      ["/semestres/4", 200, "Aún no hay ramos de ejemplo"],
      ["/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2", 200, "Certamen 2 - 2024-2"],
      ["/ramos/geometria", 200, "Geometría"],
      ["/materiales/demo-certamen-calculo-2", 200, "Certamen 2 - 2024-2"],
      ["/materiales/demo-listado-algebra-1", 200, "Archivo no disponible"],
      ["/moderacion", 404], ["/favoritos", 404], ["/ramos/no-existe", 404],
      ["/materiales/demo-pending-calculo", 404], ["/materiales/demo-rejected-calculo", 404],
    ]) {
      const html = await page(path, status);
      if (expected) assert.ok(html.includes(expected), `${path}: ${expected}`);
    }
    for (const id of ["demo-pending-calculo", "demo-rejected-calculo", "no-existe"]) {
      for (const suffix of ["/archivo", "/archivo?descargar=1"]) {
        const response = await fetch(new URL(`/materiales/${id}${suffix}`, base), { signal: AbortSignal.timeout(20000) });
        assert.equal(response.status, 404, `${id}${suffix}`);
        assert.ok(!response.headers.has("content-disposition"));
      }
    }
  });

  await t.test("HTML/RSC y bundles de /aportar no exponen materiales privados", async () => {
    const html = await page("/aportar?ramo=calculo-i");
    const response = await fetch(new URL("/aportar?ramo=calculo-i", base), { headers: { RSC: "1" }, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/x-component/);
    const rsc = await response.text();
    for (const marker of privateMarkers) assert.ok(!rsc.includes(marker), `RSC: ${marker}`);
    const scripts = new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")));
    assert.ok(scripts.size > 0);
    for (const script of scripts) {
      const asset = await fetch(new URL(script, base), { signal: AbortSignal.timeout(20000) });
      assert.equal(asset.status, 200, script);
      const js = await asset.text();
      for (const marker of privateMarkers) assert.ok(!js.includes(marker), `${script}: ${marker}`);
    }
  });
});
