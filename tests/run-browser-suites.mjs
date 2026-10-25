import { spawn } from 'node:child_process';

const runners = [
  'browser-auth.mjs', 'browser-materials.mjs', 'browser-catalog.mjs',
  'browser-favorites.mjs', 'browser-contributions.mjs',
  'browser-persistent-catalog.mjs', 'browser-tasks.mjs',
];
const results = [];
for (const runner of runners) {
  const child = spawn(process.execPath, [`tests/${runner}`], {
    env: { ...process.env, WIKI_CATALOG_QA_MODE: 'public' }, stdio: 'inherit',
  });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  results.push({ runner, code });
}
console.log(JSON.stringify({ browserSuites: results }, null, 2));
if (results.some(result => result.code !== 0)) process.exitCode = 1;
