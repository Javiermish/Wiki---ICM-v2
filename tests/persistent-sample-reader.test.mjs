import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

test("muestras conservan lector y descarga sin reconstruir ramos cuando falla catálogo", () => {
  const source = readFileSync(new URL("../src/components/materials/material-content.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const modules = {
    "react/jsx-runtime": jsx, "next/link": { default: () => null }, "lucide-react": { Download: () => null },
    "@/components/catalog/course-catalog-provider": { useCourseCatalog: () => ({ catalog: { courses: [], materials: [], offerings: [], electiveAreas: [] } }) },
    "@/components/layout/breadcrumbs": { Breadcrumbs: () => null }, "@/components/ui/badge": { Badge: () => null },
    "@/components/ui/button": { buttonVariants: () => "" }, "@/components/ui/empty-state": { EmptyState: () => null },
    "@/components/materials/document-reader": { DocumentReader: () => null },
    "@/components/materials/demo-report-dialog": { DemoReportDialog: () => null },
    "@/components/catalog/favorite-button": { FavoriteButton: () => null },
    "@/lib/catalog/query": { publicMaterialById: () => undefined }, "@/lib/catalog/course-filters": {},
  };
  const exports = {};
  new Function("require", "exports", output)((name) => { assert.ok(modules[name], name); return modules[name]; }, exports);
  const file = { kind: "pdf", url: "/materiales/demo/archivo", downloadUrl: "/materiales/demo/archivo?descargar=1", downloadName: "Certamen 2 - 2024-2.pdf", extension: "pdf" };
  const result = exports.MaterialContent({ id: "demo", file, sampleTitle: "Certamen 2 - 2024-2", filters: {}, hasContext: false });
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes(file.downloadName));
  assert.ok(serialized.includes("Muestra local independiente del catálogo"));
  assert.ok(!serialized.includes("Cálculo I"));
  const reader = result.props.children.find((child) => child?.type === modules["@/components/materials/document-reader"].DocumentReader);
  assert.equal(reader.props.file, file);
});
