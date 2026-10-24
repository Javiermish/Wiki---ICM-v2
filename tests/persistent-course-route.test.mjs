import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";

function route(getPublicCatalog) {
  const source = readFileSync(new URL("../src/app/ramos/[slug]/page.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const modules = {
    react: React, "react/jsx-runtime": jsx,
    "next/navigation": { notFound: () => { throw new Error("not-found"); } },
    "@/components/catalog/course-content": { CourseContent: () => null },
    "@/lib/catalog/persistent": { getPublicCatalog },
    "@/lib/catalog/course-filters": { parseCourseFilters: () => ({ filters: {}, errors: [] }) },
    "./loading": { default: () => null },
  };
  const exports = {};
  new Function("require", "exports", output)((name) => { assert.ok(modules[name], name); return modules[name]; }, exports);
  const page = exports.default({ params: Promise.resolve({ slug: "calculo-i" }), searchParams: Promise.resolve({}) });
  return page.props.children.type(page.props.children.props);
}

test("caída del catálogo muestra estado de error sin lanzar error de render React", async () => {
  const result = await route(async () => { throw new Error("database unavailable"); });
  assert.equal(result.type, "main");
  assert.equal(result.props.children[0].props.children, "No se pudo cargar el ramo");
  assert.equal(result.props.children[1].props.role, "alert");
});

test("solo una consulta exitosa puede determinar que un slug no existe", async () => {
  await assert.rejects(route(async () => ({ courses: [] })), /not-found/);
  const result = await route(async () => ({ courses: [{ slug: "calculo-i" }] }));
  assert.equal(result.props.slug, "calculo-i");
});
