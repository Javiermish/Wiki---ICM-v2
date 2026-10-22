import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { demoMaterialFiles } from "../src/fixtures/material-files.ts";
import { publicMaterialById } from "../src/lib/catalog/query.ts";

const require = createRequire(import.meta.url);
const standardFontDataUrl = join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + sep;

test("public/demo solo contiene muestras explícitas asociadas a materiales aprobados", async () => {
  const entries = await readdir(new URL("../public/demo/", import.meta.url), { withFileTypes: true });
  const allowed = new Set(["README.md", ...Object.values(demoMaterialFiles).map(({ filename }) => filename)]);
  assert.deepEqual(entries.map(({ name }) => name).sort(), [...allowed].sort());
  assert.ok(entries.every((entry) => entry.isFile() && !entry.isSymbolicLink()));
  for (const id of Object.keys(demoMaterialFiles)) assert.ok(publicMaterialById(demoCatalog, id));
});

test("el PDF original es válido, tiene tres páginas y texto buscable en todas ellas", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../public/demo/calculo-certamen-demo.pdf", import.meta.url)));
  const task = getDocument({ data: bytes, standardFontDataUrl, isEvalSupported: false });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 3);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const text = (await page.getTextContent()).items.map((item) => item.str ?? "").join(" ");
      assert.match(text, /continuidad/);
      assert.match(text, /DEMOSTRACION ORIGINAL/);
      assert.equal(page.getViewport({ scale: 1 }).width, 595);
    }
    assert.equal((await pdf.getAttachments()), null, "sin adjuntos");
  } finally {
    await task.destroy();
  }
});

test("PDF.js rechaza una muestra corrupta en lugar de fingir una lectura", async () => {
  const task = getDocument({ data: new TextEncoder().encode("%PDF-1.4\ncorrupto"), standardFontDataUrl });
  try { await assert.rejects(task.promise); }
  finally { await task.destroy(); }
});
