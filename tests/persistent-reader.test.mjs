import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { courseFromRow, attachExampleMaterials } from "../src/lib/catalog/rows.ts";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { toPublicCatalog } from "../src/lib/catalog/public-catalog.ts";
import { requestPageSize, requestPagination } from "../src/lib/catalog/request-pagination.ts";

async function reader({ unavailable = false } = {}) {
  const events = [];
  const row = { id: "new-from-db", slug: "stable", curriculum_id: "plan-ilustrativo", name: "Ramo PostgreSQL", code: null, description: null, kind: "regular", curricular_semester: 12, elective_area_id: null, status: "active", version: 1 };
  const client = { from: (table) => {
    events.push(table);
    const query = {
      select: () => query,
      order: () => table === "elective_areas" ? Promise.resolve({ data: [{ id: "otro", name: "Otro" }], error: null }) : query,
      eq: (key, value) => { events.push([key, value]); return query; },
      range: async (from, to) => { events.push(["range", from, to]); return unavailable ? { data: null, error: { code: "42P01" } } : { data: [row], error: null }; },
    };
    return query;
  } };
  const source = (await readFile(new URL("../src/lib/catalog/persistent.ts", import.meta.url), "utf8")).replace(/^import .*?;$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("export ", "");
  const bindings = {
    cache: (fn) => fn, connection: async () => events.push("connection"),
    getSupabaseConfig: () => ({ url: "https://example.invalid", key: "public-test-key" }),
    createSupabaseClient: () => { events.push("anonymous-client"); return client; },
    createClient: async () => { events.push("authenticated-client"); return client; },
    requireAccount: async () => ({ id: "owner" }), requireRole: async () => ({ id: "reviewer" }), requestPageSize,
    getPublicDemoCatalog: () => toPublicCatalog(demoCatalog), courseFromRow, attachExampleMaterials,
  };
  return { api: new Function(...Object.keys(bindings), `${js}; return { getPublicCatalog, listCourseRequests };`)(...Object.values(bindings)), events };
}

test("lector público toma ramos de DB sin cookies tras connection (SDK simulado)", async () => {
  const { api, events } = await reader();
  const catalog = await api.getPublicCatalog();
  assert.deepEqual(events.slice(0, 2), ["connection", "anonymous-client"]);
  assert.ok(!events.includes("authenticated-client"));
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === "status" && event[1] === "active"));
  assert.equal(catalog.courses.length, 1);
  assert.equal(catalog.courses[0].id, "new-from-db");
  assert.deepEqual(catalog.materials, []);
});

test("error real de consulta no se convierte en catálogo demo (SDK simulado)", async () => {
  const { api } = await reader({ unavailable: true });
  await assert.rejects(api.getPublicCatalog(), /No se pudo cargar.*PostgreSQL/);
});

test("solicitudes filtran estado y paginan en servidor sin descargar historial completo (SDK simulado)", async () => {
  const { api, events } = await reader();
  await api.listCourseRequests(false, { status: "pending", page: 3 });
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === "status" && event[1] === "pending"));
  assert.deepEqual(events.filter((event) => Array.isArray(event) && event[0] === "range"), [["range", 100, 149]]);
  const own = await reader();
  await own.api.listCourseRequests(true);
  assert.ok(own.events.some((event) => Array.isArray(event) && event[0] === "requested_by" && event[1] === "owner"));
});

test("parámetros de paginación rechazan arrays, negativos, fracciones y offsets enormes", () => {
  assert.deepEqual(requestPagination({ estado: "approved", pagina: "3" }), { status: "approved", page: 3, offset: 100 });
  assert.equal(requestPagination({}, true).status, "pending");
  for (const pagina of ["0", "-1", "1.5", "99999999999", ["1", "2"]]) assert.equal(requestPagination({ pagina }).page, 1);
  assert.equal(requestPagination({ estado: ["approved", "pending"] }).status, "all");
});
