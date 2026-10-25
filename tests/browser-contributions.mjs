/** Anonymous contribution boundary QA; existing loopback server only, no Auth submissions. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBrowser } from "./browser-driver.mjs";

const artifacts = resolve(".next/qa-contributions-evidence");
const report = {
  started: new Date().toISOString(), contrast: [], skipped: [],
  scope: "Anonymous /aportar redirects to login. No accounts created, no Auth submissions, no remote mutations.",
  limitations: ["No authorized external verified identity: real contribution form, course preselection, file validation/preview, upload progress, retry/receipt and moderation lifecycle NOT exercised. No public DEMO route exists. XHR helper has separate unit coverage in persistent-contributions-ui.test.mjs.", "Contrast samples cover opaque rendered text, not a full accessibility audit."],
};
let browser, tab;
async function check(name, action) {
  try { await action(); report.checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function headerReady() {
  await tab.wait(`(()=>{const buttons=[...document.querySelectorAll('button[aria-label="Tema oscuro"]')];const e=buttons[0];return buttons.length===1&&e.getClientRects().length&&Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k].onClick==='function')&&![...document.querySelectorAll('[hidden][id]')].some(e=>e.id.startsWith('S:'))})()`, "hydrated unique header");
}
async function loginRedirect(path) {
  // navigate() expects the original pathname, so use CDP for intentional redirects.
  await tab.call("Page.navigate", { url: new URL(path, process.env.WIKI_TEST_BASE_URL).href });
  await tab.wait("location.pathname==='/login'&&document.readyState==='complete'&&!!document.querySelector('main input[name=email]')", `login redirect ${path}`);
  await headerReady();
  const result = await tab.evaluate(`({path:location.pathname,next:new URLSearchParams(location.search).get('next'),form:!!document.querySelector('#contribution-form,input[type=file]'),privateMetadata:/MARCADOR_PRIVADO|privado-pendiente\\.pdf|privado-rechazado\\.pdf|originalFilename|submittedAt/.test(document.documentElement.innerHTML)})`);
  assert.equal(result.path, "/login");
  assert.ok(result.next?.startsWith("/") && !result.next.startsWith("//"));
  assert.equal(result.form, false, "No contribution controls before verified identity");
  assert.equal(result.privateMetadata, false);
  report.redirects ??= [];
  report.redirects.push({ requested: path, ...result });
}
async function layoutAndLabels(name) {
  const metrics = await tab.evaluate(`(()=>{const inputs=[...document.querySelectorAll('main input:not([type=hidden])')];return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,inputs:inputs.length,unlabelled:inputs.filter(e=>![...e.labels??[]].some(l=>l.textContent.trim())).map(e=>e.name),offscreen:inputs.filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(e=>e.name)}})()`);
  report.responsive.push({ name, ...metrics });
  assert.ok(metrics.scrollWidth <= metrics.width + 1, "No horizontal overflow");
  assert.ok(metrics.inputs >= 2, "Real login controls rendered");
  assert.deepEqual(metrics.unlabelled, []);
  assert.deepEqual(metrics.offscreen, []);
}
async function contrast(name) {
  const rows = await tab.evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d',{willReadFrequently:true});
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
    const lum=c=>c.slice(0,3).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('main h1,main p,main label,main a,main input,main button')].filter(e=>e.getClientRects().length).map(e=>{
      const s=getComputedStyle(e);let bg=rgba(s.backgroundColor),p=e.parentElement;
      while(bg[3]===0&&p){bg=rgba(getComputedStyle(p).backgroundColor);p=p.parentElement}
      const fg=rgba(s.color);if(fg[3]!==255||bg[3]!==255)return null;
      const a=lum(fg),b=lum(bg),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
      return {tag:e.tagName,text:(e.textContent||e.name||'').trim().slice(0,60),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),required:large?3:4.5};
    }).filter(Boolean);
  })()`);
  report.contrast.push({ name, samples: rows.length, failures: rows.filter(row => row.ratio < row.required) });
  assert.ok(rows.length >= 5, "Nonempty rendered contrast sample");
  assert.deepEqual(rows.filter(row => row.ratio < row.required), [], "Sampled text meets AA");
}
async function keyboard(name) {
  await tab.focus('main input[name="email"]');
  await tab.press("Tab");
  const active = await tab.evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {name:e.name,visible:!!e.getClientRects().length,focusVisible:e.matches(':focus-visible'),indicator:(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)||s.boxShadow!=='none',within:r.left>=-1&&r.right<=innerWidth+1}})()`);
  report.keyboard.push({ name, ...active });
  assert.equal(active.name, "password", "Tab from email reaches password");
  assert.ok(active.visible && active.focusVisible && active.indicator && active.within, "Visible keyboard focus in viewport");
}

try {
  assert.ok(process.env.WIKI_TEST_BASE_URL, "Set WIKI_TEST_BASE_URL; runner never starts a server");
  browser = await createBrowser({ base: new URL(process.env.WIKI_TEST_BASE_URL), artifacts, report });
  tab = await browser.createTab();
  // Safety boundary: never submit a login form, even if later scenarios change.
  await tab.call("Page.addScriptToEvaluateOnNewDocument", { source: "window.__qaSubmitAttempts=0;document.addEventListener('submit',e=>{window.__qaSubmitAttempts++;e.preventDefault();e.stopImmediatePropagation()},true)" });
  for (const width of [375, 768, 1280, 1440]) for (const dark of [false, true]) {
    const name = `aportar-login-${width}-${dark ? "dark" : "light"}`;
    await check(name, async () => {
      await tab.viewport(width);
      await loginRedirect("/aportar?ramo=calculo-i");
      await tab.theme(dark);
      await layoutAndLabels(name);
      // Capture the redirected login even if a subsequent accessibility assertion fails.
      await tab.snapshot(name);
      await contrast(name);
      await keyboard(name);
      await tab.snapshot(`${name}-focus`);
      assert.equal(await tab.evaluate("window.__qaSubmitAttempts"), 0);
    });
  }
  await check("Client-side Next Link /aportar protects the RSC transition", async () => {
    await tab.viewport(1440);
    await tab.navigate("/"); await headerReady();
    await tab.evaluate("window.__qaDocumentMarker=true");
    await tab.click('header a[href="/aportar"]');
    await tab.wait("location.pathname==='/login'&&!!document.querySelector('main input[name=email]')");
    assert.equal(await tab.evaluate("window.__qaDocumentMarker"), true, "Actual client navigation, not full reload");
    assert.equal(await tab.evaluate("!!document.querySelector('#contribution-form,input[type=file]')"), false);
  });
  await check("Catalog error is explicit; reader is checked only with available fixtures", async () => {
    await tab.navigate("/"); await headerReady();
    if (await tab.evaluate("document.body.textContent.includes('Catálogo temporalmente no disponible')")) {
      assert.equal(await tab.evaluate("document.body.textContent.includes('No se muestran ramos de demostración como reemplazo')"), true);
      assert.equal(await tab.evaluate("!!document.querySelector('a[href^=\"/materiales/demo-\"]')"), false);
      report.skipped.push({ name: "Catalog filters, curricular/academic periods, course CTA and PDF reader", reason: "Remote catalog reports unavailable; migration not authorized. No fixture replacement or false positive." });
      await tab.snapshot("catalog-unavailable");
      return;
    }
    const fixture = await tab.evaluate("!!document.querySelector('a[href=\"/materiales/demo-certamen-calculo-2\"]')");
    if (!fixture) {
      report.skipped.push({ name: "DEMO catalog/reader regressions", reason: "DEMO fixture IDs not present in current public catalog; no remote data created." });
      return;
    }
    await tab.navigate("/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2");
    assert.equal(await tab.evaluate("document.querySelector('main').textContent.includes('Certamen 2 - 2024-2')"), true);
    assert.equal(await tab.evaluate("!!document.querySelector('main a[href=\"/aportar?ramo=calculo-i\"]')"), true);
    await tab.navigate("/materiales/demo-certamen-calculo-2");
    await tab.wait("!!document.querySelector('section[aria-label^=\"Lector:\"] canvas')", "PDF reader renders a page");
  });
  await check("No browser errors, external requests, login or upload submissions", async () => {
    assert.deepEqual(report.browserErrors, []);
    assert.deepEqual(report.networkFailures, []);
    assert.deepEqual(report.unexpectedRequests, []);
  });
} catch (error) {
  report.fatal = error.stack;
  console.error(error.stack);
} finally {
  await browser?.close();
  report.status = report.fatal || report.checks?.some(row => !row.pass) ? "FAIL" : "PASS_WITH_LIMITATIONS";
  report.finished = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, "browser-contributions-report.json"), JSON.stringify(report, null, 2));
  console.log(`${report.status}: ${artifacts}`);
  if (report.status === "FAIL") process.exitCode = 1;
}
