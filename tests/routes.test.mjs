import assert from "node:assert/strict";
import test from "node:test";

// Opt-in: ejecutar con la aplicación iniciada. No sustituye pruebas de navegador.
const base = process.env.WIKI_TEST_BASE_URL;
test("rutas y HTML del prototipo", { skip: !base }, async (t) => {
  const cases = [
    ["/", 9, "Materiales para explorar"],
    ["/?q=calculo", 5, "Resultados de tu búsqueda"],
    ["/?q=Certamen+2+-+2024-2", 2, "Certamen 2 - 2024-2"],
    ["/?q=calculo&curricularSemester=1&category=certamen&year=2024&term=2&number=2", 2, "Certamen 2 - 2024-2"],
    ["/?q=calculo&curricularSemester=2&category=certamen&year=2024&term=2&number=2", 0, "No encontramos materiales de ejemplo"],
    ["/?curricularSemester=4", 0, "Todavía no hay ramos de ejemplo en este semestre"],
    ["/?q=sin-coincidencias", 0, "Limpiar búsqueda y filtros"],
    ["/?q=", 9, "Materiales para explorar"],
    ["/?term=7", 0, "Revisa los criterios de búsqueda"],
    ["/?q=calculo&q=fisica", 0, "usa un solo valor"],
  ];
  for (const [path, count, expected] of cases) {
    await t.test(path, async () => {
      const response = await fetch(new URL(path, base));
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(expected));
      assert.equal((html.match(/<article\b/g) ?? []).length, count);
      assert.ok(html.includes('lang="es"'));
      assert.ok(html.includes('name="robots" content="noindex, nofollow"'));
      assert.ok(html.includes("Prototipo con datos ficticios."));
      assert.ok(html.includes('aria-label="Tema oscuro"'));
      assert.ok(html.includes('href="#contenido"'));
      for (const id of ["contenido", "explorar", "materiales", "comunidad"]) assert.ok(html.includes(`id="${id}"`));
      for (const name of ["q", "curricularSemester", "category", "year", "term", "number"]) {
        assert.ok(html.includes(`name="${name}"`));
        assert.ok(html.includes(`for="${name}"`));
      }
      assert.ok(!html.includes("archivo-ejemplo.pdf"), "sin nombres originales en HTML público");
      for (const route of ["/materiales/", "/aportar", "/moderacion", "/favoritos"]) {
        assert.ok(!html.includes(`href="${route}`), `no hay enlaces a ${route}`);
      }
      if (count > 0 && path.includes("2024")) {
        assert.match(html, /<article\b[\s\S]*?Cálculo I[\s\S]*?Semestre curricular <!-- -->1[\s\S]*?2024-2[\s\S]*?<\/article>/);
      }
    });
  }
  await t.test("fuera de alcance sigue siendo 404", async () => {
    for (const path of ["/materiales/demo-certamen-calculo-2", "/aportar", "/moderacion", "/favoritos"]) {
      assert.equal((await fetch(new URL(path, base))).status, 404, path);
    }
  });
  await t.test("recursos CSS, JavaScript e identidad disponibles", async () => {
    const html = await (await fetch(new URL("/", base))).text();
    const paths = new Set([
      ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]),
      ...[...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]),
      "/icon.svg",
    ]);
    assert.ok(paths.size > 2);
    for (const path of paths) assert.equal((await fetch(new URL(path, base))).status, 200, path);
  });
});
