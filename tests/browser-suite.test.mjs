import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('suite habitual enumera solo seis runners vigentes, sin QA remota ni históricos', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const runners = [...pkg.scripts['test:browser'].matchAll(/node tests\/(browser-[\w-]+\.mjs)/g)].map(m => m[1]).sort();
  assert.deepEqual(runners, ['browser-auth.mjs', 'browser-catalog.mjs', 'browser-contributions.mjs', 'browser-favorites.mjs', 'browser-materials.mjs', 'browser-persistent-catalog.mjs']);
  assert.match(pkg.scripts['test:browser'], /WIKI_CATALOG_QA_MODE=public/);
  assert.doesNotMatch(pkg.scripts['test:browser'], /\*|historical|qa-authenticated/);
});

test('runners retirados no abren navegador ni sobrescriben evidencia al invocarlos', async () => {
  for (const [runner, report] of [['courses', 'qa-courses-evidence/browser-report.json'], ['moderation', 'qa-moderation-evidence/report.json']]) {
    const artifact = new URL(`../.next/${report}`, import.meta.url);
    const before = await stat(artifact).catch(() => null);
    const result = spawnSync(process.execPath, [`tests/historical/browser-${runner}.mjs`], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /RETIRADO/);
    assert.doesNotMatch(result.stdout, /PASS/);
    assert.equal((await stat(artifact).catch(() => null))?.mtimeMs, before?.mtimeMs);
  }
});
