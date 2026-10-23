/** Run against an existing production server; evidence in .next/qa-favorites-evidence. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBrowser, text } from "./browser-driver.mjs";

const base = new URL(process.env.WIKI_TEST_BASE_URL ?? "http://127.0.0.1:3100");
const artifacts = resolve(".next/qa-favorites-evidence");
const report = { checks: [], screenshots: [] };
const key = "wiki-icm:favorites:v1";
const materialId = "demo-certamen-calculo-2";
const regular = { kind: "course", id: "demo-calculo-i" };
const material = { kind: "material", id: materialId };
const cardCount = `[...document.querySelectorAll('main article')].filter(e=>e.getClientRects().length).length`;
let browser, tab;

async function check(name, action) {
  try { await action(); report.checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) {
    report.checks.push({ name, pass: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
    try { await tab.snapshot(`failure-${name}`); } catch {}
  }
}
async function navigate(path) {
  await tab.navigate(path);
  await tab.wait(`!document.querySelector('main button[aria-label$="favoritos de demo"][disabled]')`, "favorites hydrated");
}
async function link(path) {
  await tab.click(`a[href=${text(path)}]`);
  await tab.wait(`location.pathname===${text(path)} && [...document.querySelectorAll('main')].some(e=>e.getClientRects().length && e.getAttribute('aria-busy')!=='true' && e.querySelector('h1'))`, `client navigation ${path}`);
}
const save = name => `button[aria-label=${text(`Guardar ${name} en favoritos de demo`)}]`;

try {
  browser = await createBrowser({ base, artifacts, report });
  tab = await browser.createTab();
  await navigate("/favoritos");
  await tab.evaluate(`localStorage.removeItem(${text(key)})`);

  await check("Regular and elective cards save typed course references without duplicates", async () => {
    await navigate("/semestres/1");
    await tab.click(save("Cálculo I"));
    await tab.wait(`!!document.querySelector('button[aria-pressed="true"][aria-label*="Cálculo I"]')`);
    await link("/electivos");
    await tab.wait(`[...document.querySelectorAll('main article button[aria-label^="Guardar "]:not([disabled])')].some(e=>e.getClientRects().length)`);
    await tab.click('main article button[aria-label^="Guardar "]');
    const data = await tab.evaluate(`JSON.parse(localStorage.getItem(${text(key)}))`);
    assert.equal(data.version, 1);
    assert.equal(data.items.length, 2);
    assert.deepEqual(data.items[0], regular);
    assert.ok(data.items.every(item => item.kind === "course" && Object.keys(item).length === 2));
  });
  await check("Approved document joins grouped favorites and state follows client navigation", async () => {
    await navigate(`/materiales/${materialId}`);
    await tab.wait(`!!document.querySelector('main button[aria-label^="Guardar "]:not([disabled])')`);
    await tab.click('main button[aria-label^="Guardar "]');
    await tab.evaluate("window.__favoriteDocument='same-document'");
    await link("/favoritos");
    await tab.wait(`${cardCount}===3`);
    assert.equal(await tab.evaluate("window.__favoriteDocument"), "same-document");
    assert.equal(await tab.evaluate(`document.querySelector('section[aria-labelledby="favorite-courses-heading"]').querySelectorAll('article').length`), 2);
    assert.equal(await tab.evaluate(`document.querySelector('section[aria-labelledby="favorite-materials-heading"]').querySelectorAll('article').length`), 1);
    assert.deepEqual((await tab.evaluate(`JSON.parse(localStorage.getItem(${text(key)})).items`))[2], material);
    await tab.snapshot("favorites-grouped");
  });
  await check("Reload and another tab read local favorites without a fake account", async () => {
    await tab.call("Page.reload");
    await tab.wait(`${cardCount}===3`);
    const other = await browser.createTab();
    try {
      await other.navigate("/favoritos");
      await other.wait(`${cardCount}===3`);
      assert.equal(await other.evaluate(`document.querySelectorAll('input[type="email"],input[type="password"]').length`), 0);
    } finally { await other.close(); }
  });
  await check("Keyboard removal restores focus and controls announce their state", async () => {
    const remove = 'main button[aria-label="Quitar Cálculo I en favoritos de demo"]';
    assert.equal(await tab.evaluate(`document.querySelector(${text(remove)}).getAttribute('aria-pressed')`), "true");
    await tab.focus(remove); await tab.press("Enter");
    await tab.wait(`${cardCount}===2 && document.activeElement?.id==='favorites-list-heading'`);
    await tab.press("Tab");
    assert.ok(await tab.evaluate(`document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle!=='none'`));
  });
  await check("Corrupt input recovers and manipulated private IDs never become public favorites", async () => {
    await tab.evaluate(`localStorage.setItem(${text(key)},'{broken')`);
    await navigate("/favoritos");
    await tab.wait(`[...document.querySelectorAll('[role="status"]')].some(e=>e.textContent.includes('recuperó'))`);
    assert.equal(await tab.evaluate(cardCount), 0);
    const poisoned = { version: 1, items: [regular, material, material, { kind: "material", id: "demo-pending-calculo" }, { kind: "material", id: "demo-rejected-calculo" }, { kind: "course", id: "unknown" }] };
    await tab.evaluate(`localStorage.setItem(${text(key)},${text(JSON.stringify(poisoned))})`);
    await navigate("/favoritos");
    await tab.wait(`${cardCount}===2`);
    assert.ok(!await tab.evaluate(`document.querySelector('main').innerText.includes('MARCADOR_PRIVADO') || !!document.querySelector('a[href*="demo-pending-calculo"],a[href*="demo-rejected-calculo"]')`));
    await tab.snapshot("favorites-recovered");
  });
  await check("Responsive light and dark with populated and empty groups", async () => {
    for (const populated of [true, false]) {
      if (!populated) { await tab.evaluate(`localStorage.removeItem(${text(key)})`); await navigate("/favoritos"); }
      for (const width of [375, 768, 1280, 1440]) for (const dark of [false, true]) {
        await tab.viewport(width); await tab.theme(dark);
        const layout = await tab.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,labels:[...document.querySelectorAll('main button')].map(e=>({label:e.getAttribute('aria-label'),height:e.getBoundingClientRect().height}))})`);
        assert.ok(layout.scroll <= width, `overflow at ${width} dark=${dark}`);
        assert.ok(layout.labels.every(button => button.label && button.height >= 44));
        report.responsive.push({ populated, width, dark, ...layout });
        await tab.snapshot(`favorites-${populated ? "filled" : "empty"}-${width}-${dark ? "dark" : "light"}`);
      }
    }
  });
  await check("Blocked storage retains in-memory favorites with an honest warning", async () => {
    const blocked = await browser.createTab();
    try {
      await blocked.call("Page.addScriptToEvaluateOnNewDocument", { source: `Storage.prototype.getItem=function(){throw new DOMException('Blocked','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError')}` });
      await blocked.navigate("/ramos/calculo-i");
      await blocked.wait(`!!document.querySelector(${text(save("Cálculo I"))}) && !document.querySelector(${text(save("Cálculo I"))}).disabled`);
      await blocked.click(save("Cálculo I"));
      await blocked.wait(`!!document.querySelector('main button[aria-pressed="true"]')`);
      assert.equal(await blocked.evaluate(`[...document.querySelectorAll('[role="status"]')].filter(e=>e.textContent.includes('solo está en memoria')).length`), 1);
      await blocked.click('a[href="/favoritos"]');
      await blocked.wait(`location.pathname==='/favoritos' && ${cardCount}===1`);
      await blocked.snapshot("favorites-storage-blocked");
    } finally { await blocked.close(); }
  });
  assert.equal(report.browserErrors.length, 0, JSON.stringify(report.browserErrors));
  assert.equal(report.unexpectedRequests.length, 0, JSON.stringify(report.unexpectedRequests));
} catch (error) { report.fatal = error.stack; console.error(error); }
finally {
  await browser?.close();
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify(report, null, 2)).catch(() => {});
  if (report.fatal || report.checks.some(check => !check.pass)) process.exitCode = 1;
}
