import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

// Execute the real header; replace only Next/SDK and client component boundaries.
function header({ account = null, connection = async () => {}, getAccount = async () => account } = {}) {
  const source = readFileSync(new URL("../src/components/layout/site-header.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const modules = {
    "react": React,
    "react/jsx-runtime": jsx,
    "next/server": { connection },
    "next/link": { default: () => null },
    "lucide-react": { BookOpen: () => null },
    "@/components/layout/mobile-navigation": { MobileNavigation: () => null },
    "@/components/theme/theme-toggle": { ThemeToggle: () => null },
    "@/components/auth/logout-button": { LogoutButton: () => null },
    "@/lib/auth/session": { getAccount },
  };
  const exports = {};
  new Function("require", "exports", output)((name) => {
    assert.ok(modules[name], `Unexpected dependency: ${name}`);
    return modules[name];
  }, exports);
  return exports.SiteHeader();
}

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

for (const role of [null, "student", "moderator", "admin"]) {
  test(`mobile navigation has each destination once: ${role ?? "visitor"}`, async () => {
    const account = role && { id: "test", email: "qa@example.invalid", displayName: "QA", role };
    const boundary = find(header({ account }), (node) => node.type === React.Suspense);
    const content = await boundary.props.children.type();
    const controls = content.type(content.props);
    const mobile = find(controls, (node) => Array.isArray(node.props.links));
    const destinations = mobile.props.links.map(({ href }) => href);
    assert.equal(destinations.length, new Set(destinations).size, "Duplicate navigation destination");
    assert.deepEqual(destinations, [
      "/#explorar", "/electivos", "/#materiales", "/#comunidad", "/aportar", "/favoritos",
      ...(role ? ["/mi-cuenta", "/mis-aportes", "/gestion/asignaturas"] : ["/login", "/registro"]),
      ...(["moderator", "admin"].includes(role) ? ["/moderacion"] : []),
      ...(role === "admin" ? ["/admin/ramos", "/admin/usuarios"] : []),
    ]);
    assert.equal(mobile.props.signedIn, Boolean(account));
  });
}

test("static header never reads Auth; dynamic controls wait for the request before Auth", async () => {
  let connected = false, calls = 0, release;
  const request = new Promise((resolve) => { release = resolve; });
  const tree = header({
    connection: async () => { await request; connected = true; },
    getAccount: async () => { assert.ok(connected, "Auth ran before the request boundary"); calls++; return null; },
  });
  assert.equal(calls, 0);
  const boundary = find(tree, (node) => node.type === React.Suspense);
  assert.ok(boundary.props.fallback);
  const content = boundary.props.children.type();
  await Promise.resolve();
  assert.equal(calls, 0, "Auth must not run while waiting for a request");
  release();
  await content;
  assert.equal(calls, 1);
});
