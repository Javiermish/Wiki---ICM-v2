import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("gestión persistente separa autorización administrativa y solicitudes propias", () => {
  const admin = read("src/app/admin/ramos/page.tsx");
  assert.ok(admin.includes('await requireRole(["admin"], "/admin/ramos")'));
  assert.ok(admin.includes("await getAdministrationCatalog()"));
  assert.ok(admin.includes("<CourseCatalogProvider initialCatalog={catalog}><CourseManager />"));
  const own = read("src/app/gestion/asignaturas/page.tsx");
  assert.ok(own.includes('await requireAccount("/gestion/asignaturas")'));
  assert.ok(own.includes("listCourseRequests(true, pagination)"));
  assert.ok(own.includes('account.role === "admin"'));
  assert.ok(!own.includes("<CourseManager"));
});

test("formularios esperan las acciones reales, conservan datos al fallar y bloquean reenvíos", () => {
  const ui = read("src/components/courses/course-requests.tsx");
  assert.ok(ui.includes("await submitCourseRequestAction(input, justification)"));
  assert.ok(ui.includes("await reviewCourseRequestAction(request.id, decision, notes)"));
  assert.ok(ui.indexOf("await submitCourseRequestAction") < ui.indexOf('setMessage("Solicitud guardada.'));
  assert.ok(ui.indexOf("await reviewCourseRequestAction") < ui.indexOf('setMessage(decision === "approved"'));
  for (const pattern of ["inFlight.current", "disabled={!interactive || busy}", "router.refresh()", 'role={error ? "alert" : "status"}', "feedback.current?.focus()", "confirmation.current?.focus()"]) {
    assert.ok(ui.includes(pattern), pattern);
  }
  assert.ok(ui.includes('maxLength={1000} required'));
  assert.ok(ui.includes('"Confirmar aprobación" : "Confirmar rechazo"'));
  const manager = read("src/components/courses/course-manager.tsx");
  assert.ok(!manager.includes("useModeration"));
  assert.ok(!manager.includes("instanceof CourseValidationError"));
  assert.ok(!manager.includes("setFormMode"));
  assert.ok(manager.includes('document.getElementById(`archive-trigger-${course.id}`)?.focus()'));
});

test("moderación distingue solicitudes reales y ejercicios de archivos y reportes", () => {
  const page = read("src/app/moderacion/page.tsx");
  assert.ok(page.includes('await requireRole(["moderator", "admin"], "/moderacion")'));
  assert.ok(page.includes("listCourseRequests(false, pagination)"));
  assert.match(page, /<CourseRequestList\b[^>]*areas=\{requestData\[0\]\.electiveAreas\}[^>]*\breview\s*\/>/);
  assert.ok(page.includes("<ModerationWorkspace showCourseRequests={false}"));
  assert.ok(page.includes("Materiales y reportes · DEMO local"));
  const workspace = read("src/components/moderation/moderation-workspace.tsx");
  assert.ok(workspace.includes('{showCourseRequests ? <QueueSection id="solicitudes"'));
});
