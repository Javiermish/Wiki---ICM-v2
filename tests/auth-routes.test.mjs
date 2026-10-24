/** Opt-in, anonymous GETs only; no auth provider calls or credentials. */
import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.WIKI_TEST_BASE_URL;
const privateRoutes = ["/restablecer-contrasena", "/mi-cuenta", "/mis-aportes", "/moderacion", "/admin/usuarios", "/admin/ramos", "/gestion/asignaturas"];
const privateMarkers = ['name="displayName"', 'name="targetUserId"', 'name="passwordConfirm"', 'id="materiales-revision"', 'id="solicitudes"', 'id="reportes"', "Historial real de cambios de rol", "Esta es tu cuenta real.", "Todavía no hay envío, almacenamiento ni revisión real de archivos."];
const get = (path) => fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15000) });

test("callback HTTP: HEAD inocuo y enlaces malformados redirigen sin credenciales", { skip: !base }, async (t) => {
  const head = await fetch(new URL('/auth/confirm?token_hash=synthetic-not-a-real-token&type=email',base), {method:'HEAD',redirect:'manual'});
  assert.equal(head.status,204);
  assert.match(head.headers.get('cache-control'),/private.*no-store/);
  assert.equal(head.headers.get('referrer-policy'),'no-referrer');
  for (const query of ['', '?type=email', '?token_hash=invalid!&type=signup', '?code=', '?code=x&token_hash=x&type=email']) {
    await t.test(query || 'missing',async()=>{
      const response=await get(`/auth/confirm${query}${query?'&':'?'}next=https://evil.invalid`);
      assert.equal(response.status,303);
      assert.equal(new URL(response.headers.get('location'),base).href,new URL('/login?error=confirmation',base).href);
      assert.match(response.headers.get('cache-control'),/private.*no-store/);
    });
  }
});

function assertLoginDestination(destination, path) {
  const url = new URL(destination.replaceAll("&amp;", "&"), base);
  assert.equal(url.origin, new URL(base).origin);
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("next"), path);
}

test("auth HTTP: páginas de acceso y catálogo públicos sin cookies", { skip: !base }, async (t) => {
  for (const path of ["/login", "/registro", "/recuperar-contrasena", "/", "/semestres/1", "/ramos/calculo-i"]) {
    await t.test(path, async () => {
      const response = await get(path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /<main\b/);
      assert.match(html, /<h1\b/);
      assert.doesNotMatch(html, /http-equiv="refresh"/i);
      if (["/login", "/registro", "/recuperar-contrasena"].includes(path)) {
        assert.match(html, /name="email"/);
        assert.match(html, /type="email"/);
        assert.match(html, /<label\b[^>]*for=/);
        assert.match(html, /noindex/);
      }
    });
  }
});

test("auth HTTP: acceso anónimo nunca entrega contenido privado (Location o streaming Next)", { skip: !base }, async (t) => {
  for (const path of privateRoutes) {
    await t.test(path, async () => {
      const response = await get(path);
      const html = await response.text();
      for (const marker of privateMarkers) assert.ok(!html.includes(marker), `${path}: contenido privado ${marker}`);
      if ([303, 307, 308].includes(response.status)) {
        assert.ok(response.headers.get("location"));
        assertLoginDestination(response.headers.get("location"), path);
      } else {
        assert.equal(response.status, 200, "Next puede emitir redirect después del inicio de streaming");
        const meta = html.match(/<meta\b[^>]*http-equiv="refresh"[^>]*content="\d+;url=([^\"]+)"[^>]*>/i);
        assert.ok(meta, "Un HTTP 200 sin contenido privado NO basta: debe incluir redirección ejecutable");
        assertLoginDestination(meta[1], path);
      }
      const login = await get(`/login?next=${encodeURIComponent(path)}`);
      assert.equal(login.status, 200);
      assert.match(await login.text(), /name="email"/);
    });
  }
});
