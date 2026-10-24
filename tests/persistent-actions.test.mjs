import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { demoCatalog } from "../src/fixtures/catalog.ts";
import { validateCourseInput } from "../src/domain/course-management.ts";
import { courseFromRow, courseToRow } from "../src/lib/catalog/rows.ts";

async function actions(overrides = {}) {
  const calls = [];
  const source = (await readFile(new URL("../src/lib/catalog/actions.ts", import.meta.url), "utf8")).replace(/^import .*?;$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("export ", "");
  const bindings = {
    revalidatePath: () => {}, validateCourseInput, courseFromRow, courseToRow, courseColumns: "columns",
    requireRole: async () => ({ id: "admin" }), requireAccount: async () => ({ id: "student-own" }),
    getAdministrationCatalog: async () => demoCatalog, getPublicCatalog: async () => demoCatalog,
    createClient: async () => ({
      from: (table) => ({ insert: async (values) => { calls.push({ table, values }); return { error: null }; } }),
      rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; },
    }), ...overrides,
  };
  const api = new Function(...Object.keys(bindings), `${js}; return {createCourseAction, updateCourseAction, setCourseArchivedAction, submitCourseRequestAction, reviewCourseRequestAction};`)(...Object.values(bindings));
  return { api, calls };
}
const input = { name: "Nuevo ramo propuesto", code: "", kind: "elective", curricularSemester: "", electiveAreaId: "otro", description: "" };

test("acciones catálogo autorizan antes de tocar DB (doble SDK, no RLS real)", async () => {
  const { api, calls } = await actions({ requireRole: async () => { throw new Error("forbidden"); } });
  await assert.rejects(api.createCourseAction(input), /forbidden/);
  await assert.rejects(api.updateCourseAction("id", input, 1), /forbidden/);
  await assert.rejects(api.setCourseArchivedAction("id", true, 1), /forbidden/);
  await assert.rejects(api.reviewCourseRequestAction("id", "approved", "Motivo"), /forbidden/);
  assert.equal(calls.length, 0);
});

test("solicitud impone identidad y omite rol, estado e IDs enviados por cliente (doble SDK)", async () => {
  const { api, calls } = await actions();
  await api.submitCourseRequestAction({ ...input, requested_by: "other", status: "approved", id: "evil", slug: "evil", role: "admin" }, "Justificación suficiente");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "course_creation_requests");
  // PostgreSQL default auth.uid() supplies the actor; INSERT has no grant on it.
  for (const field of ["requested_by", "id", "slug", "role", "status"]) assert.ok(!(field in calls[0].values));
  assert.equal(calls[0].values.curricular_semester, null);
  assert.equal(calls[0].values.elective_area_id, "otro");
});

test("datos inválidos y revisión ambigua no llegan a DB (doble SDK)", async () => {
  const { api, calls } = await actions();
  await assert.rejects(api.submitCourseRequestAction(input, "corta"), /justificación/);
  await assert.rejects(api.submitCourseRequestAction({ ...input, kind: "regular", curricularSemester: "0" }, "Justificación suficiente"), /semestre/);
  await assert.rejects(api.reviewCourseRequestAction("invalid", "approved", "Motivo"), /decisión/);
  await assert.rejects(api.reviewCourseRequestAction("21000000-0000-0000-0000-000000000001", "pending", "Motivo"), /decisión/);
  assert.equal(calls.length, 0);
});

test("revisión usa una única RPC atómica y propaga conflicto/duplicado (doble SDK)", async () => {
  const { api, calls } = await actions();
  const id = "21000000-0000-0000-0000-000000000001";
  await api.reviewCourseRequestAction(id, "approved", " Motivo verificado ");
  assert.deepEqual(calls, [{ name: "review_course_request", args: { request_id: id, decision: "approved", notes: "Motivo verificado" } }]);
  for (const [code, message] of [["55000", /resuelta/], ["23505", /existe/], ["42501", /permisos/]]) {
    const fail = await actions({ createClient: async () => ({ rpc: async () => ({ error: { code } }) }) });
    await assert.rejects(fail.api.reviewCourseRequestAction(id, "approved", "Motivo"), message);
  }
});

test("editar exige versión actual y no regenera identidad (doble SDK)", async () => {
  const catalog = { ...demoCatalog, courses: demoCatalog.courses.map((course) => ({ ...course, version: 2 })) };
  const { api, calls } = await actions({ getAdministrationCatalog: async () => catalog });
  await assert.rejects(api.updateCourseAction("demo-calculo-i", input, 1), /cambió/);
  assert.equal(calls.length, 0);
});
