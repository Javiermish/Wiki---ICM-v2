import { createRequire } from "node:module";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

// Recursos de la MISMA versión bloqueada que usa React-PDF. Sin CDN ni descarga en runtime.
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const target = new URL("../public/pdfjs/", import.meta.url);
await mkdir(target, { recursive: true });
for (const folder of ["standard_fonts", "cmaps", "wasm"]) {
  await cp(join(source, folder), new URL(`${folder}/`, target), { recursive: true });
}
