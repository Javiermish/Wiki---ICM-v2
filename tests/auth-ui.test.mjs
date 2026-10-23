import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("las páginas privadas verifican su acceso en servidor", () => {
  for (const route of ["mi-cuenta", "mis-aportes", "restablecer-contrasena"]) {
    const page = read(`src/app/${route}/page.tsx`);
    assert.ok(page.includes(`await requireAccount("/${route}")`));
    assert.ok(page.includes("index: false"));
  }
  assert.ok(read("src/app/moderacion/page.tsx").includes('await requireRole(["moderator", "admin"], "/moderacion")'));
  const admin = read("src/app/admin/usuarios/page.tsx");
  assert.ok(admin.includes('await requireRole(["admin"], "/admin/usuarios")'));
  assert.ok(admin.includes('user.role === "admin" ?'));
  assert.ok(admin.includes('client.rpc("list_account_users",'));
  assert.ok(admin.includes("page_offset"));
  assert.ok(admin.includes(".range("));
});

test("formularios con validación, espera y resultados accesibles sin sesión ficticia", () => {
  const form = read("src/components/auth/auth-form.tsx");
  for (const contract of ["useActionState", 'aria-busy={pending}', "disabled={pending}", 'role="alert"', 'role="status"', "aria-invalid", "aria-describedby", 'name="passwordConfirm"', "minLength={12}", "maxLength={128}", "maxLength={80}", 'name="targetUserId"', 'name="enabled"', 'name="reason"', "minLength={5}", "maxLength={500}"]) assert.ok(form.includes(contract), contract);
  const shell = read("src/components/auth/auth-shell.tsx");
  assert.ok(shell.includes("isSupabaseConfigured()"));
  assert.ok(shell.includes("disabled={!configured}"));
  assert.ok(shell.includes("aucune session") || shell.includes("ninguna sesión"));
});

test("la navegación distingue sesión real y favoritos locales", () => {
  const header = read("src/components/layout/site-header.tsx");
  assert.ok(header.includes("await getAccount()"));
  assert.ok(header.includes("LogoutButton"));
  for (const route of ["/registro", "/mis-aportes", "/moderacion", "/admin/usuarios"]) assert.ok(header.includes(`"${route}"`), route);
  assert.ok(read("src/components/layout/mobile-navigation.tsx").includes("LogoutButton"));
  const account = read("src/app/mi-cuenta/page.tsx");
  assert.ok(account.includes("No se sincronizan"));
  assert.ok(read("src/app/moderacion/page.tsx").includes("no hay moderación ni publicación real"));
});
