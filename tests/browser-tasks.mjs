/** Read-only local production smoke. No uploads, credentials or database mutations. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBrowser } from './browser-driver.mjs';

const base = new URL(process.env.WIKI_TEST_BASE_URL || 'http://127.0.0.1:3107');
const artifacts = resolve('/tmp/opencode', `wiki-tasks-${Date.now()}`);
const report = { readOnly: true };
let browser;
try {
  browser = await createBrowser({ base, artifacts, report });
  const tab = await browser.createTab();
  await tab.navigate('/');
  for (const width of [375, 768, 1280, 1440]) {
    await tab.viewport(width);
    for (const dark of [false, true]) {
      await tab.theme(dark);
      await tab.navigate('/ramos/calculo-i?tipo=tareas&anio=2025&periodo=1&numero=2');
      await tab.wait(`document.querySelectorAll('nav[aria-label="Categorías de materiales"] a').length === 4`, 'four categories');
      const links = await tab.evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Categorías de materiales"] a')).map(a => ({text:a.textContent, current:a.getAttribute('aria-current'), href:a.getAttribute('href')}))`);
      assert.equal(links[3].text.trim(), 'Tareas');
      assert.equal(links[3].current, 'page');
      assert.ok(links[3].href.includes('tipo=tareas'));
      assert.equal(await tab.evaluate(`document.querySelector('input[name="tipo"]').value`), 'tareas');
      await tab.focus('nav[aria-label="Categorías de materiales"] li:nth-child(3) a');
      await tab.press('Tab');
      assert.ok(await tab.evaluate(`document.activeElement.textContent.includes('Tareas')`));
      assert.ok(await tab.evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), 'no horizontal overflow');
      assert.equal(await tab.evaluate(`document.querySelectorAll('label[for="course-year"],label[for="course-term"],label[for="course-number"]').length`), 3);
      await tab.snapshot(`tasks-${width}-${dark ? 'dark' : 'light'}`);
      report.checks.push(`${width}/${dark ? 'dark' : 'light'}: fourth active category, filters, keyboard focus, labels, no overflow`);
    }
  }
  await tab.navigate('/?category=tarea');
  assert.equal(await tab.evaluate(`document.querySelector('select[name="category"]').value`), 'tarea');
  report.checks.push('global catalog accepts tarea');
  assert.equal(report.unexpectedRequests.length, 0);
  assert.equal(report.browserErrors.length, 0);
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = error.stack; process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, error: report.error, checks: report.checks, report: resolve(artifacts, 'report.json') }, null, 2));
}
