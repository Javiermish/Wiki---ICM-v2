/**
 * Public demo QA with an existing Chromium and an already-running production server.
 * WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-courses.mjs
 * Optional WIKI_CHROME_PATH. No dependencies, app server lifecycle, or persistent app state.
 * Evidence/report: .next/qa-courses-evidence; only the browser launched here is closed.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowser, text } from "./browser-driver.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, ".next/qa-courses-evidence");
const report = { started: new Date().toISOString(), checks: [], screenshots: [] };
const management = "/gestion/asignaturas";
const pdfId = "demo-certamen-calculo-2";
const newName = "Procesos estocásticos QA";
const editedName = `${newName} revisado`;
const renamedCalculus = "Cálculo reclasificado QA";
const row = (name) => `main article:has(button[aria-label=${text(`Editar ${name}`)}])`;
const cards = `[...document.querySelectorAll('main article')].filter(e=>e.getClientRects().length)`;
const expectedMaterialIds = [pdfId, "demo-certamen-calculo-2-seccion-2", "demo-listado-calculo-3", "demo-apuntes-calculo", "demo-certamen-calculo-1"].sort();
let browser, tab, localCourse, baselineIdentity, marker;

async function check(name, action) {
  const started = Date.now();
  try { await action(); report.checks.push({ name, pass: true, ms: Date.now() - started }); console.log(`PASS ${name}`); }
  catch (error) {
    let state;
    try { state = await tab?.evaluate(`({url:location.href,main:document.querySelector('main')?.innerText?.slice(0,5000),active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,label:document.activeElement?.getAttribute('aria-label')},fields:[...document.querySelectorAll('input,select')].map(e=>({id:e.id,value:e.value,invalid:e.getAttribute('aria-invalid')}))})`); } catch {}
    report.checks.push({ name, pass: false, ms: Date.now() - started, error: error.message, stack: error.stack, state });
    console.error(`FAIL ${name}: ${error.message}`);
    try { await tab?.snapshot(`failure-${name}`); } catch {}
  }
}

async function link(href) {
  await tab.click(`a[href=${text(href)}]`);
  const target = new URL(href, process.env.WIKI_TEST_BASE_URL);
  const readySelector = target.pathname === "/" ? "#q"
    : target.pathname === management ? "#course-name"
      : target.pathname === "/favoritos" ? "#favorites-list-heading"
        : target.pathname === "/aportar" ? "#contribution-course-search"
          : target.pathname === "/electivos" ? "#elective-q"
            : target.pathname.startsWith("/semestres/") ? "#course-query"
              : target.pathname.startsWith("/ramos/") ? 'nav[aria-label="Categorías de materiales"]'
                : "#material-details";
  await tab.wait(`location.pathname===${text(target.pathname)} && location.search===${text(target.search)} && [...document.querySelectorAll(${text(readySelector)})].some(e=>e.getClientRects().length)`, `Next Link ${href}`);
  assert.equal(await tab.evaluate("window.__qaDocument"), marker, "Next Link navigation must not reload the in-memory providers");
}

async function manager() {
  await link(management);
  await tab.wait(`!!document.querySelector('#course-name') && !document.querySelector('#course-name').disabled && !document.querySelector('#course-name').closest('fieldset').disabled`, "manager hydrated");
}

async function identity(name) {
  const selector = row(name);
  await tab.wait(`!!document.querySelector(${text(selector)})`, `row ${name}`);
  if (!await tab.evaluate(`document.querySelector(${text(selector + " details")})?.open`)) await tab.click(`${selector} summary`);
  return tab.evaluate(`(()=>{const r=document.querySelector(${text(selector)});const get=label=>[...r.querySelectorAll('dt')].find(e=>e.textContent===label)?.nextElementSibling?.textContent;return {id:get('ID estable'),href:r.querySelector('a[href^="/ramos/"]')?.getAttribute('href'),status:get('Estado'),materials:Number(r.querySelector('h4')?.textContent.match(/[0-9]+/)?.[0])}})()`);
}

async function save(name) {
  await tab.click('#course-form button[type="submit"]');
  await tab.wait(`!!document.querySelector(${text(row(name))}) && [...document.querySelectorAll('[role="status"]')].some(e=>e.textContent.includes('solo en esta demo: '+${text(name)}))`, `saved ${name}`);
  assert.ok(await tab.evaluate(`document.activeElement?.getAttribute('role')==='status' && document.activeElement?.textContent.includes(${text(name)})`), "local confirmation receives focus");
}

async function category(type, expectedCount) {
  await tab.click(`nav[aria-label="Categorías de materiales"] a[href*="tipo=${type}"]`);
  await tab.wait(`new URL(location.href).searchParams.get('tipo')===${text(type)} && ${cards}.length===${expectedCount}`, `category ${type}`);
}

async function materialIds() {
  const ids = [];
  for (const [type, count] of [["listados", 1], ["apuntes", 1], ["certamenes", 3]]) {
    await category(type, count);
    ids.push(...await tab.evaluate(`${cards}.flatMap(a=>[...a.querySelectorAll('a[href^="/materiales/"]')].map(e=>new URL(e.href).pathname.split('/')[2]))`));
  }
  return [...new Set(ids)].sort();
}

async function pdfReady() {
  await tab.wait(`!!document.querySelector('section[aria-label^="Lector:"] canvas')?.width && !!document.querySelector('.textLayer span') && document.querySelector('section[aria-label^="Lector:"]')?.innerText.includes('Página 1 de 3')`, "real PDF and text layer rendered", 25000);
  await tab.wait(`(()=>{const r=[...document.querySelectorAll('section[aria-label^="Lector:"]')].find(e=>e.getClientRects().length),c=r?.querySelector('canvas');if(!c?.width||r.querySelector('[aria-busy="true"]'))return false;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(d[i+3]&&(d[i]<220||d[i+1]<220||d[i+2]<220))if(++ink>100)return true;return false})()`, "PDF canvas finishes rendering real document ink", 25000);
  assert.ok(await tab.evaluate(`!!document.querySelector('a[download][href^="/materiales/${pdfId}/archivo"]')`));
}

try {
  assert.ok(process.env.WIKI_TEST_BASE_URL, "Set WIKI_TEST_BASE_URL to the coordinator's existing production server");
  browser = await createBrowser({ base: new URL(process.env.WIKI_TEST_BASE_URL), artifacts, report });
  tab = await browser.createTab();

  await check("Regular requires curricular semester and focuses linked error summary", async () => {
    await tab.navigate(management);
    await tab.theme(true); await tab.theme(false); // Also waits for hydration.
    await tab.wait(`!document.querySelector('#course-name').closest('fieldset').disabled`);
    marker = `qa-courses-${Date.now()}`;
    await tab.evaluate(`window.__qaDocument=${text(marker)}`);
    await tab.fill("#course-name", "Regular QA sin semestre");
    await tab.click('#course-form button[type="submit"]');
    await tab.wait(`document.activeElement?.getAttribute('role')==='alert' && document.querySelector('#course-curricularSemester')?.getAttribute('aria-invalid')==='true'`, "error summary focused");
    assert.ok(await tab.evaluate(`document.querySelector('#course-curricularSemester')?.getAttribute('aria-describedby')?.includes('course-curricularSemester-error')`));
    await tab.click('main [role="alert"] a[href="#course-curricularSemester"]');
    assert.equal(await tab.evaluate("document.activeElement.id"), "course-curricularSemester");
    assert.equal(await tab.evaluate(`${cards}.length`), 9, "invalid draft did not create a course");
    await tab.snapshot("regular-missing-semester-focus");
  });

  await check("Create elective with no semester/code, then edit name and area preserving ID and slug", async () => {
    await tab.fill("#course-name", newName);
    await tab.select("#course-kind", "elective");
    await tab.wait(`!!document.querySelector('#course-electiveAreaId') && !document.querySelector('#course-curricularSemester')`);
    await tab.select("#course-electiveAreaId", "numerico");
    await tab.fill("#course-description", "Asignatura QA ficticia, sin documentos ni período académico inferido.");
    await save(newName);
    localCourse = await identity(newName);
    assert.match(localCourse.id, /^[a-zA-Z0-9-]+$/);
    assert.equal(localCourse.href, `/ramos/local-${localCourse.id}`);
    assert.equal(localCourse.materials, 0);
    await tab.click(`button[aria-label=${text(`Editar ${newName}`)}]`);
    await tab.wait(`document.activeElement?.id==='course-name' && document.querySelector('#course-name')?.value===${text(newName)}`);
    await tab.fill("#course-name", editedName);
    await tab.select("#course-electiveAreaId", "estadistica");
    await save(editedName);
    assert.deepEqual(await identity(editedName), localCourse);
    assert.ok(await tab.evaluate(`document.querySelector(${text(row(editedName))})?.innerText.includes('Estadística')`));
  });

  await check("Next Link + home search preserves memory and finds course without materials; three categories and contribution preselection", async () => {
    assert.ok(localCourse, "elective creation prerequisite");
    await link("/");
    await tab.fill("#q", "Procesos estocasticos QA");
    await tab.press("Enter");
    await tab.wait(`new URL(location.href).searchParams.get('q')==='Procesos estocasticos QA' && !!document.querySelector('main a[href=${text(localCourse.href)}]')`, "home search includes memory-only course");
    assert.equal(await tab.evaluate("window.__qaDocument"), marker, "next/form does not reload");
    assert.ok(await tab.evaluate(`document.querySelector('main').innerText.includes('Asignaturas encontradas')`));
    assert.equal(await tab.evaluate(`${cards}.length`), 0, "no documents invented for new course");
    await link(localCourse.href);
    assert.equal(await tab.evaluate("document.querySelector('h1').textContent"), editedName);
    assert.ok(await tab.evaluate(`!document.querySelector('main').innerText.includes('Semestre curricular null') && document.querySelector('main').innerText.includes('Estadística')`));
    for (const type of ["listados", "apuntes", "certamenes"]) await category(type, 0);
    await link(`/aportar?ramo=${localCourse.href.split("/").pop()}`);
    await tab.wait(`document.querySelector('input[name="courseId"]:checked')?.value===${text(localCourse.id)}`, "created course preselected in contribution");
    assert.ok(await tab.evaluate(`document.querySelector('main').innerText.includes(${text(editedName)})`));
    await manager();
  });

  await check("New regular semester 5 appears in runtime home and semester exploration", async () => {
    await tab.click('a[href="#course-form"]');
    await tab.fill("#course-name", "Análisis numérico QA regular");
    await tab.select("#course-curricularSemester", "5");
    await save("Análisis numérico QA regular");
    const regular = await identity("Análisis numérico QA regular");
    await link("/"); await link("/semestres/5");
    assert.ok(await tab.evaluate(`!!document.querySelector('main a[href=${text(regular.href)}]')`));
    await manager();
  });

  await check("Archive/reopen calculus preserves five material IDs, stable route and accessible PDF", async () => {
    baselineIdentity = await identity("Cálculo I");
    assert.equal(baselineIdentity.id, "demo-calculo-i");
    assert.equal(baselineIdentity.href, "/ramos/calculo-i");
    assert.equal(baselineIdentity.materials, 5);
    await link(baselineIdentity.href);
    assert.deepEqual(await materialIds(), expectedMaterialIds);
    const pdfHref = await tab.evaluate(`${cards}.flatMap(a=>[...a.querySelectorAll('a')]).find(a=>new URL(a.href).pathname===${text(`/materiales/${pdfId}`)})?.getAttribute('href')`);
    assert.ok(pdfHref);
    await tab.click(`main article:has(a[href=${text(pdfHref)}]) button[aria-label^="Guardar "][aria-label$="favoritos de demo"]`);
    await tab.wait(`!!document.querySelector('main article:has(a[href=${text(pdfHref)}]) button[aria-pressed="true"]')`);
    await manager();
    await tab.click('button[aria-label="Archivar Cálculo I en la demo"]');
    await tab.wait(`document.activeElement?.id==='archive-demo-calculo-i'`, "archive confirmation focus");
    await tab.click('#archive-demo-calculo-i button:last-child');
    assert.equal(await tab.evaluate("document.activeElement.id"), "archive-trigger-demo-calculo-i");
    await tab.click('button[aria-label="Archivar Cálculo I en la demo"]');
    await tab.click('#archive-demo-calculo-i button:first-child');
    await tab.wait(`!!document.querySelector('button[aria-label="Reabrir Cálculo I en la demo"]')`);
    assert.deepEqual(await identity("Cálculo I"), { ...baselineIdentity, status: "Archivado" });
    await link("/"); await link("/semestres/1");
    assert.ok(!await tab.evaluate(`[...document.querySelectorAll('main a[href="/ramos/calculo-i"]')].some(e=>e.getClientRects().length)`), "archived course excluded from visible semester selectors");
    await manager(); await identity("Cálculo I"); await link(baselineIdentity.href);
    assert.ok(await tab.evaluate(`document.querySelector('main').innerText.includes('Ramo archivado') && !document.querySelector('main a[href^="/aportar?ramo="]')`));
    assert.deepEqual(await materialIds(), expectedMaterialIds);
    await link(pdfHref); await pdfReady();
    await manager();
    await tab.click('button[aria-label="Reabrir Cálculo I en la demo"]');
    await tab.wait(`!!document.querySelector('button[aria-label="Archivar Cálculo I en la demo"]')`);
    assert.deepEqual(await identity("Cálculo I"), baselineIdentity);
  });

  await check("Reclassify calculus as elective: PDF, names, search and favorites resolve current catalog by ID", async () => {
    await tab.click('button[aria-label="Editar Cálculo I"]');
    await tab.fill("#course-name", renamedCalculus);
    await tab.select("#course-kind", "elective");
    await tab.select("#course-electiveAreaId", "numerico");
    await save(renamedCalculus);
    assert.deepEqual(await identity(renamedCalculus), baselineIdentity);
    await link("/ramos/calculo-i");
    assert.deepEqual(await materialIds(), expectedMaterialIds);
    await tab.click(`main a[href^="/materiales/${pdfId}?"]`); await pdfReady();
    assert.ok(await tab.evaluate(`document.querySelector('main').innerText.includes(${text(renamedCalculus)}) && !!document.querySelector('main a[href="/electivos?area=numerico"]')`));
    assert.ok(!await tab.evaluate(`document.querySelector('main').innerText.includes('Semestre curricular null')`));
    await link("/favoritos");
    await tab.wait(`${cards}.length===1`);
    const favorite = await tab.evaluate(`${cards}.map(e=>e.innerText)`);
    assert.ok(favorite[0].includes(renamedCalculus) && favorite[0].includes("Numérico"));
    assert.ok(!favorite[0].includes("Semestre curricular 1"));
    assert.ok(await tab.evaluate(`!!document.querySelector('main a[href^="/materiales/${pdfId}"]')`));
    await tab.snapshot("favorites-reclassified-material");
    await link("/"); await tab.fill("#q", renamedCalculus); await tab.press("Enter");
    await tab.wait(`${cards}.length===5 && new URL(location.href).searchParams.get('q')===${text(renamedCalculus)}`);
    assert.ok((await tab.evaluate(`${cards}.map(e=>e.innerText)`)).every((value) => value.includes(renamedCalculus) && value.includes("Numérico")));
    assert.equal(await tab.evaluate("window.__qaDocument"), marker);
  });

  await check("Another tab has isolated courses and empty favorites without resetting the first tab", async () => {
    const other = await browser.createTab();
    try {
      await other.navigate(management); await other.theme(true); await other.theme(false);
      assert.ok(!await other.evaluate(`document.querySelector('main').innerText.includes(${text(editedName)}) || document.querySelector('main').innerText.includes(${text(renamedCalculus)})`));
      assert.ok(await other.evaluate(`!!document.querySelector('button[aria-label="Editar Cálculo I"]')`));
      await other.navigate("/favoritos");
      assert.equal(await other.evaluate(`${cards}.length`), 0);
      await link("/favoritos"); assert.equal(await tab.evaluate(`${cards}.length`), 1);
      await manager(); assert.equal((await identity(editedName)).id, localCourse.id);
    } finally { await other.close(); }
  });

  await check("Real keyboard focus styling, skip link, management controls and favorite removal focus", async () => {
    await tab.focus('a[href="#contenido"]'); await tab.press("Enter");
    await tab.wait(`document.activeElement?.id==='contenido'`);
    await tab.focus("#course-search");
    const steps = [];
    for (let i = 0; i < 12; i++) {
      await tab.press("Tab");
      steps.push(await tab.evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,65),visible:!!r.width&&!!r.height,focusVisible:e.matches(':focus-visible'),outline:s.outlineStyle,outlineWidth:s.outlineWidth,shadow:s.boxShadow}})()`));
    }
    report.keyboard.push({ width: 1280, steps });
    assert.ok(steps.some((step) => step.id === "course-status"));
    assert.ok(steps.every((step) => step.visible && step.focusVisible && ((step.outline !== "none" && parseFloat(step.outlineWidth) > 0) || step.shadow !== "none")), "all Tab targets have visible focus");
    await link("/favoritos");
    const remove = 'main button[aria-label^="Quitar "][aria-label$="favoritos de demo"]';
    await tab.focus(remove); await tab.press("Enter");
    await tab.wait(`${cards}.length===0 && document.activeElement?.id==='favorites-list-heading'`, "removed favorite returns focus to list heading");
    // Restore a favorite to verify it disappears after reload, not merely after removal.
    await link("/");
    await tab.click('main button[aria-label^="Guardar Certamen 2 - 2024-2"][aria-label*="Sección 1 "]');
    await link("/favoritos"); await tab.wait(`${cards}.length===1`);
  });

  await check("Reload discards local courses, classification changes and favorites", async () => {
    await tab.call("Page.reload");
    await tab.wait(`document.readyState==='complete' && !!document.querySelector('#favorites-list-heading')?.getClientRects().length && ${cards}.length===0`);
    assert.notEqual(await tab.evaluate("window.__qaDocument"), marker);
    await tab.navigate(management);
    assert.ok(!await tab.evaluate(`document.querySelector('main').innerText.includes(${text(editedName)})`));
    assert.ok(await tab.evaluate(`!!document.querySelector('button[aria-label="Editar Cálculo I"]')`));
    await tab.navigate(localCourse.href);
    await tab.wait(`document.querySelector('main').innerText.includes('Ramo local no disponible')`);
    await tab.navigate("/ramos/calculo-i");
    assert.ok(await tab.evaluate(`document.querySelector('h1').textContent==='Cálculo I' && document.querySelector('main').innerText.includes('Semestre curricular 1')`));
  });

  await check("Elective area Todas preserves the current search query", async () => {
    await tab.navigate("/electivos?area=numerico&q=simulacion");
    const allSelector = 'nav[aria-label="Áreas de electivos"] a:first-child';
    await tab.wait(`!!document.querySelector(${text(allSelector)})?.getClientRects().length`);
    const href = await tab.evaluate(`document.querySelector(${text(allSelector)}).getAttribute('href')`);
    const destination = new URL(href, process.env.WIKI_TEST_BASE_URL);
    assert.equal(destination.searchParams.get("q"), "simulacion", "Todas must preserve q instead of clearing it");
    assert.equal(destination.searchParams.get("area"), null);
    await tab.click(allSelector);
    await tab.wait(`location.pathname==='/electivos' && new URL(location.href).searchParams.get('q')==='simulacion' && !new URL(location.href).searchParams.has('area') && document.querySelector('#elective-q')?.value==='simulacion'`, "Todas navigation retains query");
  });

  await check("Mobile management actions sit below course headings without compressing names", async () => {
    await tab.viewport(375); await tab.navigate(management); await tab.theme(false);
    const rows = await tab.evaluate(`${cards}.map(e=>{const h=e.querySelector('h3').getBoundingClientRect(),a=e.querySelector('button[aria-label^="Editar "]').getBoundingClientRect(),r=e.getBoundingClientRect();return {name:e.querySelector('h3').textContent,headingBottom:h.bottom,headingWidth:h.width,actionTop:a.top,cardWidth:r.width}})`);
    report.mobileActions = rows;
    await tab.snapshot("management-mobile-action-layout");
    assert.ok(rows.length >= 9);
    assert.ok(rows.every((item) => item.actionTop >= item.headingBottom + 1 && item.headingWidth >= item.cardWidth - 50), `actions must stack below full-width course names: ${JSON.stringify(rows)}`);
  });

  for (const width of [365, 375, 768, 1280, 1440]) for (const dark of [false, true]) for (const [name, path] of [["gestion", management], ["electivos", "/electivos"], ["favoritos", "/favoritos"], ["semestre5", "/semestres/5"], ["material", `/materiales/${pdfId}`]]) {
    await check(`Responsive ${name} ${width}px ${dark ? "dark" : "light"}`, async () => {
      await tab.viewport(width); await tab.navigate(path); await tab.theme(dark);
      if (name === "material") await pdfReady();
      const layout = await tab.evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,headings:[...document.querySelectorAll('main h1,main h2,main h3')].filter(e=>e.getClientRects().length).map(e=>({text:e.innerText,client:e.clientWidth,scroll:e.scrollWidth})),unlabelled:[...document.querySelectorAll('main input,main select,main textarea')].filter(e=>e.getClientRects().length&&!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>({id:e.id,type:e.type}))})`);
      report.responsive.push({ page: name, dark, ...layout });
      await tab.snapshot(`${name}-${width}-${dark ? "dark" : "light"}`);
      assert.ok(layout.scrollWidth <= width && layout.bodyWidth <= width, `horizontal overflow: ${JSON.stringify(layout)}`);
      assert.ok(layout.headings.every((heading) => heading.scroll <= heading.client + 1), "headings are not clipped horizontally");
      assert.deepEqual(layout.unlabelled, [], "visible native form controls have accessible labels");
    });
  }
  await check("No runtime/hydration errors, failed resources, external requests or submission endpoints", async () => {
    assert.deepEqual(report.browserErrors, []);
    assert.deepEqual(report.networkFailures, []);
    assert.deepEqual(report.unexpectedRequests, []);
  });
} catch (error) {
  report.fatal = { error: error.message, stack: error.stack };
  console.error(`BLOCKED ${error.stack}`);
} finally {
  report.finished = new Date().toISOString();
  report.summary = { passed: report.checks.filter((item) => item.pass).length, failed: report.checks.filter((item) => !item.pass).length, screenshots: report.screenshots.length, browserErrors: report.browserErrors?.length ?? 0, networkFailures: report.networkFailures?.length ?? 0 };
  try { await browser?.close(); } finally {
    await mkdir(artifacts, { recursive: true });
    await writeFile(resolve(artifacts, "browser-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary)); console.log(`Report: ${resolve(artifacts, "browser-report.json")}`);
  }
}
if (report.fatal || report.summary.failed) process.exitCode = 1;
