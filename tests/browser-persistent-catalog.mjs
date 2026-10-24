/** Read-only persistent-catalog QA; never creates accounts, mutates rows, or uses credentials.
 * WIKI_TEST_BASE_URL=http://127.0.0.1:3102 node tests/browser-persistent-catalog.mjs
 * WIKI_CATALOG_QA_MODE=public enables public-catalog smoke once DB is migrated.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBrowser } from './browser-driver.mjs';

const base = new URL(process.env.WIKI_TEST_BASE_URL || 'http://127.0.0.1:3102');
const mode = process.env.WIKI_CATALOG_QA_MODE || 'error';
assert.ok(['error', 'public'].includes(mode), 'Mode must be error or public');
const artifacts = resolve('/tmp/opencode', `wiki-persistent-catalog-${Date.now()}`);
await mkdir(artifacts, { recursive: true });
const report = { started: new Date().toISOString(), mode, readOnly: true };
let browser;
try {
  browser = await createBrowser({ base, artifacts, report });
  const tab = await browser.createTab();
  for (const width of [1280, 390]) {
    await tab.viewport(width);
    for (const route of ['/', '/semestres/1', '/electivos', '/ramos/calculo-i']) {
      await tab.navigate(route);
      if (mode === 'error') {
        await tab.wait(`!!document.querySelector('[role="alert"][aria-label="Error del catálogo"]')`, 'explicit DB outage');
        assert.equal(await tab.evaluate(`document.querySelectorAll('main a[href^="/ramos/"],main a[href^="/materiales/"]').length`), 0, `no fabricated courses ${route}`);
        assert.equal(await tab.evaluate(`document.querySelector('main')?.innerText.includes('Cálculo I')`), false, `no fixture fallback ${route}`);
      } else {
        assert.equal(await tab.evaluate(`!!document.querySelector('[aria-label="Error del catálogo"]')`), false, 'public catalog must load');
        if (route === '/') assert.ok(await tab.evaluate(`document.querySelectorAll('a[href^="/ramos/"]').length > 0`), 'public course links');
      }
      const dimensions = await tab.evaluate(`({viewport:innerWidth,document:document.documentElement.scrollWidth})`);
      assert.ok(dimensions.document <= dimensions.viewport + 1, `horizontal overflow ${width} ${route}`);
      report.responsive.push({ width, route, ...dimensions });
      await tab.snapshot(`${mode}-${width}-${route === '/' ? 'home' : route.replaceAll('/', '-')}`);
      report.checks.push(`${width} ${route}: ${mode} state; no horizontal overflow`);
    }
    await tab.navigate('/login');
    assert.ok(await tab.evaluate(`!!document.querySelector('input[type="email"]') && !!document.querySelector('input[type="password"]')`), 'login remains usable');
    await tab.focus('input[type="email"]'); await tab.press('Tab');
    report.keyboard.push({ width, from: 'email', focusedAfterTab: await tab.evaluate(`({tag:document.activeElement.tagName,type:document.activeElement.type,name:document.activeElement.name})`) });
    assert.equal(await tab.evaluate(`document.activeElement.type`), 'password', 'keyboard reaches password');
    await tab.snapshot(`login-${width}`);
    // Page.navigate bypasses route helper because an authentication redirect is expected.
    await tab.call('Page.navigate', { url: new URL('/admin/ramos', base).href });
    await tab.wait(`location.pathname==='/login' && document.readyState==='complete' && !!document.querySelector('input[type="email"]')`, 'admin requires login');
    assert.equal(await tab.evaluate(`new URLSearchParams(location.search).get('next')`), '/admin/ramos', 'safe internal return path');
    report.checks.push(`${width}: login available; keyboard email→password; admin redirects with safe next`);
    await tab.navigate('/');
    await tab.theme(true); await tab.snapshot(`dark-${width}`);
    await tab.theme(false);
    if (mode === 'error') {
      await tab.focus('[aria-label="Error del catálogo"] a'); await tab.press('Enter');
      await tab.wait(`document.readyState==='complete' && !!document.querySelector('[aria-label="Error del catálogo"]')`, 'retry retains truthful error');
      report.checks.push(`${width}: retry keyboard activation and light/dark`);
    }
  }
  assert.equal(report.unexpectedRequests.length, 0, 'no external browser requests or write requests');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = error.stack; process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, error: report.error, checks: report.checks, browserErrors: report.browserErrors?.map(({type,text,url}) => ({type,text,url})), report: resolve(artifacts, 'report.json') }, null, 2));
}
