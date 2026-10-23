/** Anonymous real-browser QA. Existing loopback server only. Never submits to Auth. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBrowser, text } from "./browser-driver.mjs";

const artifacts = resolve(".next/qa-auth-evidence");
const report = { started: new Date().toISOString(), skipped: [], validation: [], contrast: [], scope: "Anonymous browser; no backend doubles, no valid submissions or authenticated sessions" };
const routes = ["/login", "/registro", "/recuperar-contrasena"];
const privateRoutes = ["/restablecer-contrasena", "/mi-cuenta", "/mis-aportes", "/moderacion", "/admin/usuarios"];
let browser, tab;
async function check(name, action) {
  try { await action(); report.checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
const email = 'main input[name="email"]';
const submit = 'main button[type="submit"]';

async function layout(name) {
  const metrics = await tab.evaluate(`(()=>{const width=innerWidth;return {width,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('main *')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > width+1}).map(e=>e.tagName+':'+e.className)}})()`);
  report.responsive.push({ name, ...metrics });
  assert.ok(metrics.scrollWidth <= metrics.width + 1, `${name} horizontal overflow`);
  assert.deepEqual(metrics.offenders, [], `${name} elements outside viewport`);
}
async function labels() {
  const failures = await tab.evaluate(`(()=>{const inputs=[...document.querySelectorAll('main input:not([type="hidden"])')];return inputs.filter(e=>!e.labels?.length || ![...e.labels].some(l=>l.textContent.trim()) || !e.autocomplete).map(e=>e.name)})()`);
  assert.deepEqual(failures, [], "Visible inputs need associated non-empty labels and autocomplete");
  assert.equal(await tab.evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size})()"), true, "Unique IDs");
}
async function contrast(name) {
  const rows = await tab.evaluate(`(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('main h1,main p,main label,main a,main input,main button')].filter(e=>e.getClientRects().length).map(e=>{
      const style=getComputedStyle(e);let bg=rgba(style.backgroundColor),parent=e.parentElement;
      while(bg[3]===0&&parent){bg=rgba(getComputedStyle(parent).backgroundColor);parent=parent.parentElement}
      const fg=rgba(style.color);if(fg[3]!==255||bg[3]!==255)return null;
      const a=lum(fg),b=lum(bg),large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
      return {tag:e.tagName,text:(e.textContent||e.name||'').trim().slice(0,70),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),required:large?3:4.5};
    }).filter(Boolean);
  })()`);
  report.contrast.push({ name, samples: rows.length, minimumRatio: Math.min(...rows.map(row=>row.ratio)), failures: rows.filter(row=>row.ratio<row.required) });
  assert.ok(rows.length >= 5, "Rendered opaque text sample populated");
  assert.deepEqual(rows.filter(row=>row.ratio<row.required), [], "Sampled rendered text meets WCAG AA");
}
async function headerReady() {
  // A visible SSR fallback is not interactive yet. Wait for its hydrated replacement.
  await tab.wait(`(()=>{const buttons=[...document.querySelectorAll('button[aria-label="Tema oscuro"]')];const e=buttons[0];return buttons.length===1 && e.getClientRects().length && Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k].onClick==='function') && ![...document.querySelectorAll('[hidden][id]')].some(e=>e.id.startsWith('S:')) && e.getAttribute('aria-pressed')===String(document.documentElement.classList.contains('dark'))})()`, "unique hydrated header and settled Suspense");
}
async function keyboard(name, enabled) {
  await tab.focus(enabled ? email : 'main a[href="/"]');
  await tab.press("Tab");
  const active = await tab.evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,name:e.getAttribute('name'),visible:!!e.getClientRects().length,focusVisible:e.matches(':focus-visible'),indicator:(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)||s.boxShadow!=='none',within:r.left>=-1&&r.right<=innerWidth+1}})()`);
  report.keyboard.push({ name, ...active });
  assert.notEqual(active.tag, "BODY", "Tab must reach a control/link");
  assert.ok(active.visible && active.focusVisible && active.indicator && active.within, "Keyboard focus must be visible and in viewport");
  await tab.snapshot(`${name}-focus`);
}
async function validation(name) {
  // This capture-phase safety guard also prevents accidental valid submits, without replacing native validation.
  assert.equal(await tab.evaluate("window.__qaAuthGuardInstalled"), true);
  await tab.fill(email, "");
  await tab.focus(submit); await tab.press("Enter");
  await tab.wait("document.activeElement?.name==='email'");
  assert.equal(await tab.evaluate(`document.querySelector(${text(email)}).validity.valueMissing`), true);
  await tab.fill(email, "correo-invalido");
  await tab.focus(submit); await tab.press("Enter");
  await tab.wait("document.activeElement?.name==='email'");
  assert.equal(await tab.evaluate(`document.querySelector(${text(email)}).validity.typeMismatch`), true);
  const message = await tab.evaluate(`document.querySelector(${text(email)}).validationMessage`);
  assert.ok(message);
  // Reserved .invalid address cannot receive mail. No submit is allowed to reach the server.
  if (await tab.evaluate("!!document.querySelector('main input[name=password]')")) {
    await tab.fill(email, "qa@example.invalid");
    const minimum = await tab.evaluate("document.querySelector('main input[name=password]').minLength");
    await tab.fill('main input[name="password"]', minimum > 1 ? "x" : "");
    await tab.focus(submit); await tab.press("Enter");
    await tab.wait("document.activeElement?.name==='password'");
    const invalidity = minimum > 1 ? "tooShort" : "valueMissing";
    assert.equal(await tab.evaluate(`document.querySelector('main input[name=password]').validity.${invalidity}`), true);
  }
  assert.equal(await tab.evaluate("window.__qaAuthSubmitAttempts"), 0, "All tests must be rejected before submit dispatch");
  report.validation.push({ name, nativeEmailMessage: message, submitEvents: 0 });
  await tab.snapshot(`${name}-invalid`);
}

try {
  assert.ok(process.env.WIKI_TEST_BASE_URL, "Set WIKI_TEST_BASE_URL to an existing production server");
  browser = await createBrowser({ base: new URL(process.env.WIKI_TEST_BASE_URL), artifacts, report });
  tab = await browser.createTab();
  await tab.call("Page.addScriptToEvaluateOnNewDocument", { source: `window.__qaAuthSubmitAttempts=0;window.__qaAuthGuardInstalled=true;document.addEventListener('submit',e=>{window.__qaAuthSubmitAttempts++;e.preventDefault();e.stopImmediatePropagation()},true);` });
  for (const width of [375, 1440]) {
    await tab.viewport(width);
    for (const dark of [false, true]) {
      for (const route of routes) {
        const name = `${route.slice(1)}-${width}-${dark ? "dark" : "light"}`;
        await check(name, async () => {
          await tab.navigate(route);
          await headerReady();
          await tab.theme(dark);
          await layout(name); await labels(); await contrast(name);
          await tab.snapshot(name);
          const enabled = await tab.evaluate(`!document.querySelector(${text(email)}).matches(':disabled')`);
          if (!enabled) {
            assert.equal(await tab.evaluate("[...document.querySelectorAll('main [role=status]')].some(e=>e.textContent.includes('Autenticación no disponible'))"), true);
            assert.equal(await tab.evaluate(`document.querySelector(${text(submit)}).matches(':disabled')`), true);
            report.skipped.push({ name, reason: "Auth unconfigured: inputs/submit correctly disabled. Native validation and enabled-field keyboard require configured provider." });
          }
          await keyboard(name, enabled);
          if (enabled) await validation(name);
        });
      }
    }
  }
  await check("Expired/invalid confirmation displays accessible generic error", async () => {
    await tab.navigate("/login?error=confirmation");
    await headerReady(); await contrast("login-confirmation-error");
    assert.equal(await tab.evaluate("[...document.querySelectorAll('main [role=alert]')].some(e=>e.textContent.includes('No se pudo confirmar'))"), true);
    await tab.snapshot("login-confirmation-error");
  });
  for (const width of [375,1440]) for (const dark of [false,true]) {
    await check(`Database and unverified-email messages stay distinct ${width}px ${dark?'dark':'light'}`,async()=>{
      await tab.viewport(width);
      await tab.navigate('/login?error=profile');await headerReady();await tab.theme(dark);await layout('profile-error');
      assert.equal(await tab.evaluate("[...document.querySelectorAll('main [role=alert]')].some(e=>e.textContent.includes('perfil y rol')&&e.textContent.includes('migraciones'))"),true);
      await contrast('profile-error');await tab.snapshot(`profile-error-${width}-${dark?'dark':'light'}`);
      await tab.navigate('/login?error=unverified');await headerReady();await tab.theme(dark);
      assert.equal(await tab.evaluate("[...document.querySelectorAll('main [role=alert]')].some(e=>e.textContent.includes('Confirma tu correo')&&!e.textContent.includes('migraciones'))"),true);
      await tab.snapshot(`unverified-error-${width}-${dark?'dark':'light'}`);
    });
  }
  for (const route of privateRoutes) {
    await check(`Anonymous private navigation ${route}`, async () => {
      // driver.navigate requires the original pathname; redirects must use the lower-level CDP call.
      await tab.call("Page.navigate", { url: new URL(route, process.env.WIKI_TEST_BASE_URL).href });
      await tab.wait(`location.pathname==='/login' && new URLSearchParams(location.search).get('next')===${text(route)} && !!document.querySelector('main input[name=email]')`, `redirect ${route}`);
      assert.equal(await tab.evaluate("!!document.querySelector('input[name=displayName],input[name=targetUserId],#materiales-revision,#solicitudes,#reportes')"), false);
      await tab.call("Page.reload", { ignoreCache: true });
      await tab.wait(`location.pathname==='/login' && new URLSearchParams(location.search).get('next')===${text(route)} && document.readyState==='complete' && !!document.querySelector('main input[name=email]')`, `reload redirect ${route}`);
    });
  }
  await check("Internal Next Link to moderation redirects visitor without reloading the document", async () => {
    await tab.navigate('/'); await headerReady();
    await tab.evaluate('window.__qaDocumentMarker=true');
    await tab.click('footer a[href="/moderacion"]');
    await tab.wait("location.pathname==='/login' && new URLSearchParams(location.search).get('next')==='/moderacion' && !!document.querySelector('main input[name=email]')");
    assert.equal(await tab.evaluate('window.__qaDocumentMarker'), true, 'Expected client-side Next navigation');
    assert.equal(await tab.evaluate("!!document.querySelector('#materiales-revision,#solicitudes,#reportes')"), false);
  });
  await check("Public catalog remains browsable without a session", async () => {
    for (const route of ["/", "/semestres/1", "/ramos/calculo-i"]) {
      await tab.navigate(route); await layout(route);
      assert.equal(await tab.evaluate("!!document.querySelector('main h1')"), true);
    }
  });
  await check("Mobile navigation has unique destinations and accessible keyboard dismissal", async () => {
    await tab.viewport(375);
    await tab.navigate("/"); await headerReady();
    await tab.click('button[aria-label="Navegación principal"]');
    await tab.wait('document.querySelector(\'button[aria-label="Navegación principal"]\').getAttribute("aria-expanded")==="true"');
    const links = await tab.evaluate('[...document.querySelectorAll(\'nav[aria-label="Navegación principal móvil"] a\')].map(e=>e.getAttribute("href"))');
    assert.equal(links.length, new Set(links).size);
    assert.equal(links.filter(href=>href==="/favoritos").length, 1);
    await tab.focus('nav[aria-label="Navegación principal móvil"] a');
    await tab.press("Escape");
    assert.equal(await tab.evaluate('document.activeElement?.getAttribute("aria-label")'), "Navegación principal");
    assert.equal(await tab.evaluate('document.querySelector(\'button[aria-label="Navegación principal"]\').getAttribute("aria-expanded")'), "false");
    await tab.snapshot("mobile-navigation");
  });
  await check("No JS errors, failed requests, external calls or mutations", async () => {
    assert.deepEqual(report.browserErrors, []);
    assert.deepEqual(report.consoleWarnings.filter(row => /same key|prerender|blocking route|hydration/i.test(row.text)), []);
    assert.deepEqual(report.networkFailures, []);
    assert.deepEqual(report.unexpectedRequests, []);
  });
  assert.ok(report.checks.every((check) => check.pass), "See report.json for failures");
} catch (error) {
  report.fatal = error.stack; process.exitCode = 1;
} finally {
  await browser?.close();
  report.finished = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Evidence: ${artifacts}`);
}
