import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.WIKI_TEST_BASE_URL;
const privateMarkers = ["MARCADOR_PRIVADO", "demo-pending-calculo", "demo-rejected-calculo", "privado-pendiente.pdf", "privado-rechazado.pdf", "originalFilename", "submittedAt"];

async function page(path, status = 200) {
  const response = await fetch(new URL(path, base));
  assert.ok(response.status === status || (status === 404 && path.startsWith("/ramos/") && response.status === 200), path);
  const html = await response.text();
  if (status === 404 && path.startsWith("/ramos/")) assert.ok(html.includes("No encontramos esta página"), "404 semántico incluso tras streaming");
  // Next puede reflejar el segmento solicitado en el estado del router de un 404.
  // Eso no es información obtenida del catálogo: no confundirlo con una fuga.
  for (const marker of privateMarkers.filter((marker) => !path.includes(marker))) {
    assert.ok(!html.includes(marker), `${path} filtra ${marker} del HTML y RSC`);
  }
  assert.ok(html.includes('lang="es"'));
  assert.ok(html.includes('id="contenido"'));
  return html;
}

test("navegación HTTP de semestres, ramos, categorías y filtros", { skip: !base }, async (t) => {
  await t.test("Inicio → Semestre 1 → Cálculo I", async () => {
    assert.ok((await page("/")).includes('href="/semestres/1"'));
    const semester = await page("/semestres/1");
    assert.ok(semester.includes("Semestre curricular 1"));
    assert.ok(semester.includes('href="/ramos/calculo-i"'));
    assert.ok(semester.includes("Cálculo I") && semester.includes("Álgebra I"));
    const course = await page("/ramos/calculo-i");
    assert.ok(course.includes('href="/semestres/1"'));
    assert.ok(course.includes("Cálculo I"));
    for (const category of ["Listados", "Apuntes", "Certámenes"]) assert.ok(course.includes(category));
  });

  await t.test("buscador local por nombre y código y semestre vacío", async () => {
    for (const query of ["calculo", "DEMO-C1"]) {
      const html = await page(`/semestres/1?q=${query}`);
      assert.ok(html.includes('href="/ramos/calculo-i"'));
      assert.ok(!html.includes('href="/ramos/algebra-i"'));
    }
    assert.ok(!(await page("/semestres/2?q=calculo")).includes('href="/ramos/calculo-i"'));
    assert.ok((await page("/semestres/4")).includes("Aún no hay ramos de ejemplo"));
    assert.ok((await page("/semestres/5")).includes("Aún no hay ramos de ejemplo"));
    assert.ok((await page("/semestres/3")).includes('href="/ramos/geometria"'));
    assert.ok((await page("/semestres/1?q=nada-coincide")).includes("Limpiar búsqueda"));
    assert.ok((await page("/semestres/1?q=uno&q=dos")).includes("usa un solo valor"));
  });

  await t.test("categorías independientes y filtros simultáneos persistentes", async () => {
    const cases = [
      ["/ramos/calculo-i", 1, "Listado 3 - 2025-1"],
      ["/ramos/calculo-i?tipo=apuntes", 1, "Apuntes - 2025-2"],
      ["/ramos/calculo-i?tipo=certamenes", 3, "Certamen 2 - 2024-2"],
      ["/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2", 2, "Certamen 2 - 2024-2"],
      ["/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=1&numero=1", 1, "Certamen 1 - 2024-1"],
    ];
    for (const [path, count, title] of cases) {
      for (let reload = 0; reload < 2; reload++) {
        const html = await page(path);
        assert.equal((html.match(/<article\b/g) ?? []).length, count, path);
        assert.ok(html.includes(title));
        assert.match(html, /Semestre curricular(?: <!-- -->| )1/);
      }
    }
    const html = await page(cases[3][0]);
    for (const [name, value] of [["anio", "2024"], ["periodo", "2"], ["numero", "2"]]) {
      const select = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`));
      if (select) assert.match(select[1], new RegExp(`<option[^>]*value="${value}"[^>]*selected|<option[^>]*selected[^>]*value="${value}"`));
      else {
        const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
        assert.ok(input, `control ${name} disponible`);
        assert.ok(input[0].includes(`value="${value}"`), `${name} conserva ${value}`);
      }
    }
    assert.ok(html.includes("Sección") && html.includes("Versión"));
    assert.ok(html.includes("tipo=apuntes&amp;anio=2024&amp;periodo=2&amp;numero=2"));
    assert.ok(html.includes('href="/ramos/calculo-i?tipo=certamenes"'), "limpieza conserva la categoría actual");
  });

  await t.test("vacíos, parámetros desconocidos e inválidos", async () => {
    for (const path of [
      "/ramos/calculo-i?tipo=listados&anio=2024&periodo=2&numero=2",
      "/ramos/calculo-i?tipo=certamenes&anio=2099",
      "/ramos/geometria?tipo=certamenes",
    ]) {
      const html = await page(path);
      assert.equal((html.match(/<article\b/g) ?? []).length, 0);
      assert.ok(html.includes("ejemplo") || html.includes("filtros"));
    }
    for (const query of ["tipo=otro", "periodo=3", "anio=abc", "numero=0", "numero=1&numero=2", "tipo=listados&tipo=apuntes"]) {
      const html = await page(`/ramos/calculo-i?${query}`);
      assert.ok(html.includes('role="alert"'));
      assert.equal((html.match(/<article\b/g) ?? []).length, 0);
    }
    const unknown = await page("/ramos/calculo-i?tipo=certamenes&ignorado=x&curricularSemester=2");
    assert.equal((unknown.match(/<article\b/g) ?? []).length, 3);
    assert.ok(!unknown.includes('<option value="2099"'));
    assert.ok(!unknown.includes('<option value="98"'));
    assert.ok(!unknown.includes('<option value="99"'));
  });

  await t.test("IDs privados y rutas inválidas no son accesibles", async () => {
    for (const path of [
      "/semestres/0", "/semestres/13", "/semestres/abc", "/semestres/1.0", "/semestres/01", "/semestres/-1",
      "/ramos/no-existe", "/ramos/demo-pending-calculo", "/ramos/demo-rejected-calculo",
      "/materiales/demo-pending-calculo", "/materiales/demo-rejected-calculo", "/materiales/no-existe",
    ]) await page(path, 404);
    const privateSearch = await page("/?q=privado");
    assert.equal((privateSearch.match(/<article\b/g) ?? []).length, 0);
  });

  await t.test("sin metadatos privados en RSC ni en JavaScript público enlazado", async () => {
    const scripts = new Set();
    for (const path of ["/", "/semestres/1", "/ramos/calculo-i?tipo=certamenes"]) {
      const html = await page(path);
      for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(match[1]);
      const response = await fetch(new URL(path, base), { headers: { RSC: "1" } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/x-component/);
      const rsc = await response.text();
      for (const marker of privateMarkers) assert.ok(!rsc.includes(marker), `${path}: RSC sin ${marker}`);
    }
    assert.ok(scripts.size > 0);
    for (const script of scripts) {
      const response = await fetch(new URL(script, base));
      assert.equal(response.status, 200);
      const js = await response.text();
      for (const marker of privateMarkers) assert.ok(!js.includes(marker), `${script}: bundle sin ${marker}`);
    }
  });
});
