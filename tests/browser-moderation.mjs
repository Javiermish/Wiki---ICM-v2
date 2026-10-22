/** Existing production server only: WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-moderation.mjs */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBrowser, text } from "./browser-driver.mjs";

const artifacts = resolve(".next/qa-moderation-evidence");
const report = { started: new Date().toISOString() };
let browser, tab;
const visibleArticles = (id) => `[...document.querySelectorAll(${text(`#${id} article`)})].filter(e=>e.getClientRects().length)`;
const visibleCourseCount = `[...document.querySelectorAll('main article')].filter(e=>e.getClientRects().length).length`;
async function check(name, action) {
  await action();
  report.checks.push({ name, pass: true });
  console.log(`PASS ${name}`);
}
async function clickText(scope, tag, label) {
  await tab.evaluate(`(()=>{document.querySelector('[data-qa-moderation-target]')?.removeAttribute('data-qa-moderation-target');const e=[...document.querySelectorAll(${text(`${scope} ${tag}`)})].find(e=>e.getClientRects().length&&e.textContent.trim()===${text(label)});if(!e)throw new Error('Visible control not found: '+${text(label)});e.setAttribute('data-qa-moderation-target','true')})()`);
  await tab.click('[data-qa-moderation-target="true"]');
}
async function link(href) {
  await tab.click(`a[href=${text(href)}]`);
  const pathname = new URL(href, process.env.WIKI_TEST_BASE_URL).pathname;
  const ready = pathname.startsWith("/materiales/") ? "#material-details" : pathname === "/gestion/asignaturas" ? "#course-name" : "#materiales-revision-query";
  await tab.wait(`location.pathname===${text(pathname)} && [...document.querySelectorAll(${text(ready)})].some(e=>e.getClientRects().length)`, `ready ${href}`);
  assert.equal(await tab.evaluate("window.__moderationQA"), "preserve-memory");
}
async function notice(textValue) {
  await tab.wait(`document.activeElement?.getAttribute('role')==='status' && document.activeElement.textContent.includes(${text(textValue)})`, "local notice focused");
}

try {
  assert.ok(process.env.WIKI_TEST_BASE_URL, "Set WIKI_TEST_BASE_URL to the existing production server");
  browser = await createBrowser({ base: new URL(process.env.WIKI_TEST_BASE_URL), artifacts, report });
  tab = await browser.createTab();
  await tab.navigate("/moderacion");
  await tab.wait("!document.querySelector('main > div > fieldset').disabled", "moderation hydrated");
  await tab.evaluate("window.__moderationQA='preserve-memory'");

  await check("Public demo has three independent filtered queues and accessible labels", async () => {
    assert.equal(await tab.evaluate(`${visibleArticles("materiales-revision")}.length`), 2);
    assert.equal(await tab.evaluate(`${visibleArticles("solicitudes")}.length`), 2);
    assert.equal(await tab.evaluate(`${visibleArticles("reportes")}.length`), 1);
    assert.equal(await tab.evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size})()"), true);
    for (const id of ["materiales-revision", "solicitudes", "reportes"]) {
      await tab.fill(`#${id}-query`, "no-coincide-qa");
      await tab.wait(`${visibleArticles(id)}.length===0`);
      await clickText(`#${id}`, "button", "Ver todos los estados");
      await tab.select(`#${id}-status`, id === "reportes" ? "open" : "pending");
    }
  });

  await check("Explicit confirmation, rejection reason, focus and local history", async () => {
    const row = '#materiales-revision article:has(#contribution-synthetic-review-material-1-category)';
    await clickText(row, "button", "Aprobar demo");
    await tab.wait("document.activeElement?.getAttribute('role')==='group'");
    await clickText(row, "button", "Cancelar");
    assert.equal(await tab.evaluate(`${visibleArticles("materiales-revision")}.length`), 2);
    await clickText(row, "button", "Rechazar demo");
    await tab.fill(`${row} [role="group"] textarea`, "   ");
    await clickText(row, "button", "Confirmar rechazar en demo");
    await tab.wait("document.activeElement?.getAttribute('role')==='alert'");
    await tab.fill(`${row} [role="group"] textarea`, "Rechazo QA sintético: faltan antecedentes.");
    await clickText(row, "button", "Confirmar rechazar en demo");
    await notice("rechazo");
    assert.equal(await tab.evaluate(`${visibleArticles("materiales-revision")}.length`), 1);
    await tab.select("#materiales-revision-status", "rejected");
    assert.equal(await tab.evaluate(`${visibleArticles("materiales-revision")}.length`), 2);
    await clickText("#materiales-revision article:first-of-type", "summary", "Historial ficticio y local (1)");
    assert.ok(await tab.evaluate("document.querySelector('#materiales-revision').innerText.includes('Rechazo QA sintético')"));
    await tab.select("#materiales-revision-status", "pending");
  });

  await check("Metadata correction shares normalized names; public sample uses real reader", async () => {
    const row = '#materiales-revision article:has(#contribution-synthetic-review-material-2-category)';
    await clickText(row, "summary", "Corregir metadatos de la muestra");
    await tab.select("#contribution-synthetic-review-material-2-category", "listado");
    await tab.fill("#contribution-synthetic-review-material-2-documentNumber", "3");
    await tab.fill("#contribution-synthetic-review-material-2-academicYear", "2024");
    await tab.fill("#contribution-synthetic-review-material-2-academicTerm", "2");
    await tab.fill("#synthetic-review-material-2-correction-reason", "Corrección QA sintética.");
    await clickText(row, "button", "Guardar corrección DEMO");
    await notice("Metadatos corregidos");
    assert.equal(await tab.evaluate(`document.querySelector(${text(`${row} h3`)})?.textContent`), "Listado 3 - 2024-2");
    await clickText(row, "button", "Ver muestra pública (no es el envío)");
    await tab.wait("!!document.querySelector('#synthetic-review-material-2-preview canvas')?.width && !!document.querySelector('#synthetic-review-material-2-preview .textLayer span')", "original public PDF reader", 30000);
    await tab.snapshot("moderation-real-public-sample");
    await clickText(row, "button", "Cerrar muestra pública");
    await clickText(row, "button", "Aprobar demo");
    await clickText(row, "button", "Confirmar aprobar en demo");
    await notice("aprobación");
    await tab.wait(`${visibleArticles("materiales-revision")}.length===0`);
  });

  await check("Management reuses request form; review correction supports regular/elective and creates no course", async () => {
    await link("/gestion/asignaturas");
    await tab.wait("!document.querySelector('#course-name').closest('fieldset').disabled");
    const initialCourseCount = await tab.evaluate(visibleCourseCount);
    await tab.fill("#course-name", "Solicitud de ramo QA sintética");
    await tab.select("#course-kind", "elective");
    await tab.select("#course-electiveAreaId", "estadistica");
    await clickText("#course-form", "label", "Solicitar revisión DEMO (no crea ramo)");
    await clickText("#course-form", "button", "Añadir solicitud a cola DEMO");
    await notice("Solicitud DEMO");
    assert.equal(await tab.evaluate(visibleCourseCount), initialCourseCount);
    await tab.fill("#course-name", "Solicitud de ramo QA sintética");
    await tab.select("#course-kind", "elective");
    await tab.select("#course-electiveAreaId", "estadistica");
    await clickText("#course-form", "button", "Añadir solicitud a cola DEMO");
    await tab.wait("document.activeElement?.getAttribute('role')==='alert'", "duplicate request rejected");
    assert.ok(!await tab.evaluate("!!document.querySelector('#course-duplicates-heading').closest('aside').querySelector('a[href^=\"/ramos/demo-request-\"]')"), "request reservations must never link to an invented public course");
    await link("/moderacion#solicitudes");
    await tab.fill("#solicitudes-query", "Solicitud de ramo QA sintética");
    await tab.wait(`${visibleArticles("solicitudes")}.length===1`);
    await clickText("#solicitudes", "summary", "Corregir propuesta del ramo");
    const inputPrefix = await tab.evaluate("document.querySelector('#solicitudes input[name=name]').id.slice(0,-5)");
    await tab.select(`#${inputPrefix}-kind`, "regular");
    await tab.select(`#${inputPrefix}-curricularSemester`, "12");
    await tab.fill(`#${inputPrefix}-correction-reason`, "Reclasificación QA sintética.");
    await clickText("#solicitudes", "button", "Guardar propuesta DEMO");
    await notice("Propuesta corregida");
    assert.ok(await tab.evaluate("document.querySelector('#solicitudes').innerText.includes('semestre curricular 12')"));
    await clickText("#solicitudes", "button", "Aprobar demo");
    await clickText("#solicitudes", "button", "Confirmar aprobar en demo");
    await notice("aprobación");
    await link("/gestion/asignaturas");
    assert.equal(await tab.evaluate(visibleCourseCount), initialCourseCount);
    await link("/moderacion");
  });

  await check("Single report dialog shares memory across routes; explanatory resolution never unpublishes", async () => {
    const materialHref = await tab.evaluate("document.querySelector('#reportes article a[href^=\"/materiales/\"]').getAttribute('href')");
    await link(materialHref);
    await clickText("main", "button", "Reportar material");
    await tab.wait("!!document.querySelector('dialog[open]')");
    await tab.select("dialog[open] select[name=reason]", "Documento ilegible");
    await tab.fill("dialog[open] textarea", "Reporte QA compartido entre rutas.");
    await clickText("dialog[open]", "button", "Probar reporte demo");
    await tab.wait("document.querySelector('dialog [role=status]')?.textContent.includes('cola DEMO local')");
    await link("/moderacion#reportes");
    await tab.fill("#reportes-query", "Reporte QA compartido");
    await tab.wait(`${visibleArticles("reportes")}.length===1`);
    await clickText("#reportes", "button", "Resolver reporte demo");
    await tab.fill("#reportes [role=group] textarea", "   ");
    await clickText("#reportes", "button", "Confirmar resolver en demo");
    await tab.wait("document.activeElement?.getAttribute('role')==='alert'");
    await tab.fill("#reportes [role=group] textarea", "Se revisó la muestra pública: resolución QA sin retirar material.");
    await clickText("#reportes", "button", "Confirmar resolver en demo");
    await notice("resolución");
    await tab.select("#reportes-status", "resolved");
    assert.ok(await tab.evaluate("document.querySelector('#reportes').innerText.includes('resolución QA sin retirar')"));
    await link(materialHref);
    assert.ok(await tab.evaluate("!!document.querySelector('#material-details')"));
    await link("/moderacion");
  });

  await check("Reload resets queues and responsive light/dark has no horizontal overflow", async () => {
    await tab.navigate("/moderacion");
    await tab.wait("!document.querySelector('main > div > fieldset').disabled");
    assert.equal(await tab.evaluate(`${visibleArticles("materiales-revision")}.length`), 2);
    assert.equal(await tab.evaluate(`${visibleArticles("solicitudes")}.length`), 2);
    assert.equal(await tab.evaluate(`${visibleArticles("reportes")}.length`), 1);
    assert.ok(!await tab.evaluate("document.querySelector('main').innerText.includes('Reporte QA compartido')"));
    for (const width of [375, 768, 1280, 1440]) for (const dark of [false, true]) {
      await tab.viewport(width); await tab.theme(dark);
      assert.ok(await tab.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `overflow ${width} dark=${dark}`);
      await tab.snapshot(`moderation-${width}-${dark ? "dark" : "light"}`);
    }
  });
  assert.deepEqual(report.browserErrors, [], "No browser errors");
  assert.deepEqual(report.unexpectedRequests, [], "No writes or external requests");
  report.pass = true;
} catch (error) {
  report.pass = false; report.failure = error.stack;
  try { await tab?.snapshot("failure"); } catch {}
  console.error(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
}
