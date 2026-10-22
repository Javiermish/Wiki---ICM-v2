/**
 * Real Chromium material reader QA via CDP. No installed dependencies, server or build lifecycle.
 * WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-materials.mjs
 * Optional WIKI_CHROME_PATH; local fixtures only. Evidence: .next/qa-materials-evidence/.
 * Independent checks continue on failure and emit JSON + screenshots.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = new URL(process.env.WIKI_TEST_BASE_URL || 'http://127.0.0.1:3100');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'This fixture-only runner requires a loopback origin.');
const artifacts = resolve(root, '.next/qa-materials-evidence');
const profile = resolve(root, '.next/qa-m-profile');
const browserHome = resolve(profile, 'home');
for (const dir of [artifacts, profile, browserHome, resolve(profile, 'config'), resolve(profile, 'cache'), resolve(profile, 'tmp')]) await mkdir(dir, { recursive: true });
const cacheRoot = resolve(homedir(), '.cache/ms-playwright');
const cachedVersions = (await readdir(cacheRoot).catch(() => []))
  .filter(name => /^chromium-\d+$/.test(name))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const cachedExecutables = cachedVersions.flatMap(name => [
  resolve(cacheRoot, name, 'chrome-linux64/chrome'),
  resolve(cacheRoot, name, 'chrome-linux/chrome'),
]);
const candidates = [process.env.WIKI_CHROME_PATH, ...cachedExecutables, '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let executable;
for (const path of candidates) { try { await access(path, constants.X_OK); executable = path; break; } catch {} }
assert.ok(executable, 'No executable Chrome found. Set WIKI_CHROME_PATH; this runner never installs browsers.');
const report = { started: new Date().toISOString(), base: base.href, executable, sandbox: 'enabled', checks: [], screenshots: [], browserErrors: [], consoleWarnings: [], networkFailures: [], keyboard: [], responsive: [], contrast: [], requests: [], responses: [], downloads: [], workers: [], limitations: [], expectedErrors: [] };
let chrome;
let socket;
let rpc;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => JSON.stringify(value);
const visibleCards = `([...document.querySelectorAll('main article')].filter(e => e.getClientRects().length > 0))`;


async function launch(noSandbox = false) {
  const args = ['--headless', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-breakpad', '--disable-crash-reporter', '--password-store=basic', '--use-mock-keychain', '--window-size=1280,900', ...(noSandbox ? ['--no-sandbox'] : []), 'about:blank'];
  chrome = spawn(executable, args, { cwd: root, env: { ...process.env, HOME: browserHome, XDG_CONFIG_HOME: resolve(profile, 'config'), XDG_CACHE_HOME: resolve(profile, 'cache'), TMPDIR: resolve(profile, 'tmp') }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome startup timeout: ${stderr}`)), 15000);
    chrome.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const ws = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (ws) { clearTimeout(timer); resolve(ws[1]); }
    });
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}: ${stderr}`)); });
  });
}

function connection(ws) {
  let id = 0;
  const requests = new Map();
  const listeners = new Map();
  ws.addEventListener('message', message => {
    const packet = JSON.parse(message.data);
    if (packet.id) {
      const request = requests.get(packet.id);
      if (!request) return;
      requests.delete(packet.id); clearTimeout(request.timer);
      if (packet.error) request.reject(new Error(`${request.method}: ${JSON.stringify(packet.error)}`));
      else request.resolve(packet.result);
    } else for (const listener of listeners.get(packet.method) ?? []) listener(packet.params, packet.sessionId);
  });
  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const messageId = ++id;
        const timer = setTimeout(() => { requests.delete(messageId); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
        requests.set(messageId, { resolve, reject, timer, method });
        ws.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(method, listener) { listeners.set(method, [...(listeners.get(method) ?? []), listener]); },
  };
}

let session;
const call = (method, params = {}) => rpc.send(method, params, session);
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function wait(expression, description = expression, timeout = 12000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { last = await evaluate(expression); if (last) return last; } catch (error) { last = error.message; }
    await sleep(70);
  }
  throw new Error(`Wait failed: ${description}; last=${JSON.stringify(last)}`);
}
async function navigate(path) {
  const { errorText } = await call('Page.navigate', { url: new URL(path, base).href });
  assert.ok(!errorText, errorText);
  await wait(`document.readyState === 'complete' && !![...document.querySelectorAll('main')].find(e => e.getClientRects().length > 0 && e.getAttribute('aria-busy') !== 'true' && e.querySelector('h1'))`, `page ready ${path}`);
  await evaluate('document.fonts.ready.then(() => true)');
  await sleep(150);
}
async function press(key, modifiers = 0) {
  const codes = { ArrowLeft: 37, ArrowRight: 39, Tab: 9, Enter: 13, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, ' ': 32 };
  const code = key === ' ' ? 'Space' : key;
  const params = { key, code, modifiers, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function focus(selector) {
  assert.ok(await evaluate(`(() => { const el = document.querySelector(${text(selector)}); if (!el) return false; el.focus(); return document.activeElement === el; })()`), `focus ${selector}`);
}
async function click(selector) {
  const rect = await evaluate(`(() => { const el = document.querySelector(${text(selector)}); if (!el) return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}; })()`);
  assert.ok(rect?.width > 0 && rect?.height > 0, `visible click target ${selector}`);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}
async function viewport(width) {
  await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
}
async function theme(dark) {
  if (await evaluate(`document.documentElement.classList.contains('dark')`) !== dark) await click('button[aria-label="Tema oscuro"]');
  await wait(`document.documentElement.classList.contains('dark') === ${dark} && document.querySelector('button[aria-label="Tema oscuro"]')?.getAttribute('aria-pressed') === '${dark}'`, `theme ${dark ? 'dark' : 'light'}`);
}
async function check(name, fn) {
  const start = Date.now();
  try { await fn(); report.checks.push({ name, pass: true, ms: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (error) {
    let state;
    try { state = await evaluate(`({url:location.href,title:document.title,h1:document.querySelector('h1')?.innerText,images:[...document.querySelectorAll('main img')].map(i=>({src:i.currentSrc,complete:i.complete,naturalWidth:i.naturalWidth})),cards:${visibleCards}.length,selects:[...document.querySelectorAll('select')].map(s=>({id:s.id,value:s.value})),active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent?.slice(0,80)},body:document.querySelector('main')?.innerText?.slice(0,2200)})`); } catch {}
    report.checks.push({ name, pass: false, ms: Date.now() - start, error: error.message, checkpoint: report.navigationCheckpoint, state });
    console.error(`FAIL ${name}: ${error.message}`);
    try { await snapshot('failure-' + name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0,100)); } catch {}
  }
}
async function snapshot(name, fullPage = true) {
  await evaluate('window.scrollTo(0,0)');
  await sleep(100);
  const metrics = await call('Page.getLayoutMetrics');
  const width = await evaluate('innerWidth');
  const height = fullPage ? Math.min(18000, Math.ceil(metrics.cssContentSize.height)) : await evaluate('innerHeight');
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  const path = resolve(artifacts, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  report.screenshots.push(path);
}

const pdfId = 'demo-certamen-calculo-2';
const pdfPath = `/materiales/${pdfId}`;
const reader = 'section[aria-label^="Lector:"]';
const pageOutput = `${reader} [aria-label="Controles del lector"] output:not([aria-label])`;
const matchOutput = '[aria-label="Coincidencias"] output';
const searchInput = 'form[aria-label="Buscar texto en todo el PDF"] input';
const downloads = resolve(artifacts, 'downloads');
let injecting = false;
let interceptionError;
const exprButton = label => `([...document.querySelectorAll('button')].find(e => e.getClientRects().length && (e.getAttribute('aria-label') === ${text(label)} || e.textContent.trim() === ${text(label)})))`;
async function button(label) {
  const rect = await evaluate(`(() => {const e=${exprButton(label)}; if(!e || e.disabled)return null; e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert.ok(rect, `enabled visible button ${label}`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
}
async function focusButton(label) {
  assert.ok(await evaluate(`(() => {const e=${exprButton(label)};e?.focus();return !!e && e===document.activeElement;})()`), `focus ${label}`);
}
async function pdfReady(page = 1) {
  await wait(`document.querySelector(${text(pageOutput)})?.textContent === ${text(`Página ${page} de 3`)} && !!document.querySelector(${text(`${reader} canvas`)}) && document.querySelector(${text(`${reader} canvas`)})?.width > 0 && !!document.querySelector(${text(`${reader} .textLayer span`)}) && ![...document.querySelectorAll(${text(`${reader} [aria-busy="true"]`)})].length`, `real PDF page ${page} rendered`, 20000);
}
async function pdfPage(page) {
  await pdfReady(page);
  assert.equal(await evaluate(`document.querySelector(${text(`${reader} .react-pdf__Page`)})?.getAttribute('data-page-number')`), String(page));
}
async function imageReady() {
  // A decoded <img> alone is insufficient: load/error may precede hydration,
  // leaving a visually valid image permanently announced as loading.
  const state = await wait(`(() => {
    const r=document.querySelector(${text(reader)}),i=r?.querySelector('img');
    if(!r||!i)return false;
    const state={complete:i.complete,naturalWidth:i.naturalWidth,visible:getComputedStyle(i).display!=='none',busy:i.closest('[aria-busy]')?.getAttribute('aria-busy'),busyNodes:r.querySelectorAll('[aria-busy="true"]').length,loadingText:/Cargando\\s*imagen/i.test(r.textContent),alerts:r.querySelectorAll('[role="alert"]').length};
    return state.complete&&state.naturalWidth>0&&state.visible&&state.busy==='false'&&state.busyNodes===0&&!state.loadingText&&state.alerts===0&&state;
  })()`, 'native image decoded and loading UI/aria-busy fully settled');
  assert.equal(state.busy, 'false', 'decoded image is no longer announced as busy');
  assert.equal(state.loadingText, false, 'decoded image has no lingering Cargando imagen text');
  (report.imageReadiness ??= []).push({ ...state });
}
async function typedSearch(term) {
  await click(searchInput);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, commands: ['selectAll'] });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await call('Input.insertText', { text: term });
  await press('Enter');
  await wait(`!!document.querySelector('form[role="search"] [role="status"]')?.textContent && document.querySelector('form[role="search"] [role="status"]')?.getAttribute('aria-busy')==='false'`, 'whole-PDF search finished');
}
async function localWait(fn, description, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await fn(); if (value) return value; await sleep(70); }
  throw new Error(`Wait failed: ${description}`);
}
function errorEvent(row) { (injecting ? report.expectedErrors : report.browserErrors).push(row); }

try {
  assert.equal((await fetch(base, { signal: AbortSignal.timeout(10000) })).status, 200, 'Existing local server must be available');
  let wsUrl;
  try { wsUrl = await launch(); }
  catch (error) {
    if (!/sandbox|namespace|Operation not permitted/i.test(error.message)) throw error;
    report.sandbox = 'disabled only for ephemeral loopback fixture browser; environment blocks sandbox';
    report.sandboxFailure = error.message;
    if (chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGTERM'); await exited; }
    wsUrl = await launch(true);
  }
  socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  rpc = connection(socket);
  report.browserVersion = await rpc.send('Browser.getVersion');
  await rpc.send('Target.setDiscoverTargets', { discover: true });
  rpc.on('Target.targetCreated', ({ targetInfo }) => { if (targetInfo.type === 'worker') report.workers.push(targetInfo); });
  const { targetId } = await rpc.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await rpc.send('Target.attachToTarget', { targetId, flatten: true }));
  rpc.on('Runtime.exceptionThrown', (event, sid) => { if (sid === session) errorEvent({ type: 'exception', ...event.exceptionDetails }); });
  rpc.on('Runtime.consoleAPICalled', (event, sid) => {
    if (sid !== session) return;
    const row = { type: event.type, text: event.args.map(arg => arg.value ?? arg.description ?? '').join(' ') };
    if (event.type === 'error') errorEvent(row);
    if (event.type === 'warning') report.consoleWarnings.push({ ...row, injected: injecting });
  });
  rpc.on('Log.entryAdded', (event, sid) => { if (sid === session && event.entry.level === 'error') { const row={ type:'log', ...event.entry }; if(event.entry.url===new URL('/materiales/no-existe',base).href)report.expectedErrors.push(row); else errorEvent(row); } });
  rpc.on('Network.requestWillBeSent', (event, sid) => { if (sid === session) report.requests.push({ id: event.requestId, url: event.request.url, method: event.request.method, type: event.type, injected: injecting }); });
  rpc.on('Network.responseReceived', (event, sid) => { if (sid === session) report.responses.push({ id: event.requestId, url: event.response.url, status: event.response.status, mimeType: event.response.mimeType, type: event.type, injected: injecting }); });
  rpc.on('Network.loadingFailed', (event, sid) => {
    if (sid === session && !event.canceled && event.errorText !== 'net::ERR_ABORTED') (injecting ? report.expectedErrors : report.networkFailures).push(event);
  });
  rpc.on('Browser.downloadWillBegin', event => report.downloads.push({ ...event, state: 'started' }));
  rpc.on('Browser.downloadProgress', event => { const row = report.downloads.find(row => row.guid === event.guid); if (row) Object.assign(row, event); });
  for (const method of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await call(method);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  // Observe real Worker construction/received messages without faking PDF.js or
  // replacing its transport. TargetInfo.url is blank and Runtime.enable hangs
  // for unattached module workers on some Chromium versions. Proxy delegates
  // to the original native constructor and preserves the original instance.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const NativeWorker=window.Worker;window.__qaNativeWorkers=[];
    window.Worker=new Proxy(NativeWorker,{construct(target,args){
      const instance=Reflect.construct(target,args);
      const record={url:String(args[0]),type:args[1]?.type,messages:[]};
      window.__qaNativeWorkers.push(record);
      instance.addEventListener('message',event=>record.messages.push({action:event.data?.action,source:event.data?.sourceName,target:event.data?.targetName}));
      return instance;
    }});
  })()` });
  await mkdir(downloads, { recursive: true });
  await rpc.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, eventsEnabled: true });
  await viewport(1280);

  await check('Real PDF.js: local worker, nonblank canvas, one page mounted, separate academic semester', async () => {
    await navigate(pdfPath); await pdfReady();
    assert.equal(await evaluate(`document.querySelector('h1')?.textContent`), 'Certamen 2 - 2024-2');
    const details = await evaluate(`Object.fromEntries([...document.querySelectorAll('dl > div')].map(e=>[e.querySelector('dt')?.textContent,e.querySelector('dd')?.textContent]))`);
    assert.equal(details['Semestre curricular'], '1');
    assert.equal(details['Período académico'], '2024-2');
    assert.equal(details['Semestre académico'], '2');
    assert.equal(await evaluate(`document.querySelectorAll(${text(`${reader} canvas`)}).length`), 1);
    const pixels = await evaluate(`(() => {const c=document.querySelector(${text(`${reader} canvas`)}),ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&(data[i]<220||data[i+1]<220||data[i+2]<220))ink++;return {width:c.width,height:c.height,ink};})()`);
    assert.ok(pixels.ink > 100, `PDF canvas actually contains document ink: ${JSON.stringify(pixels)}`);
    const targets = (await rpc.send('Target.getTargets')).targetInfos.filter(row => row.type === 'worker');
    report.workers.push(...targets);
    assert.ok(targets.length > 0, 'a real dedicated worker target exists');
    // Chromium can report an empty TargetInfo.url for module workers until attached.
    const workers = await evaluate('window.__qaNativeWorkers || []');
    report.workerRuntime = workers;
    assert.ok(workers.some(row=>/worker.*\\.mjs|pdf.*worker/i.test(row.url) && new URL(row.url, base).origin===base.origin && row.messages.some(message=>message.action==='GetDoc')), 'native dedicated worker exchanges real messages from a local module');
    const localWorker = workers.find(row=>new URL(row.url, base).origin===base.origin);
    const workerResponse = await fetch(new URL(localWorker.url, base));
    report.workerHTTP = {url:localWorker.url,status:workerResponse.status,mimeType:workerResponse.headers.get('content-type')};
    assert.equal(workerResponse.status,200);
    assert.match(workerResponse.headers.get('content-type'), /javascript/);
    assert.ok((await workerResponse.text()).includes('WorkerMessageHandler'), 'same-origin worker resource is real PDF.js code');
    assert.ok(!report.consoleWarnings.some(row => /fake worker/i.test(row.text)), 'no fake-worker fallback');
    assert.ok(report.responses.some(row => row.url === new URL(`${pdfPath}/archivo`, base).href && row.status === 200 && row.mimeType === 'application/pdf'), 'real PDF bytes fetched via endpoint');
    // Worker targets have their own network domain; HTTP + live native-worker messages above avoids confusing page-only Network events with fake workers.
  });

  await check('PDF page navigation reaches 1/2/3 and both bounds disable', async () => {
    await navigate(pdfPath); await pdfPage(1);
    assert.equal(await evaluate(`${exprButton('Página anterior')}.disabled`), true);
    await focusButton('Página siguiente'); await press('Enter'); await pdfPage(2);
    await button('Página siguiente'); await pdfPage(3);
    assert.equal(await evaluate(`${exprButton('Página siguiente')}.disabled`), true);
    assert.equal(await evaluate(`document.querySelector(${text(pageOutput)}).textContent`), 'Página 3 de 3');
    await button('Página anterior'); await pdfPage(2);
    await button('Página anterior'); await pdfPage(1);
    assert.equal(await evaluate(`${exprButton('Página anterior')}.disabled`), true);
  });

  await check('Zoom 50–300 percent bounds, reset and fit width without page overflow', async () => {
    await navigate(pdfPath); await pdfReady();
    for (let i = 0; i < 2; i++) await button('Reducir zoom');
    await wait(`document.querySelector('output[aria-label="Zoom"]')?.textContent==='50%'`);
    assert.equal(await evaluate(`${exprButton('Reducir zoom')}.disabled`), true);
    for (let i = 0; i < 10; i++) await button('Aumentar zoom');
    await wait(`document.querySelector('output[aria-label="Zoom"]')?.textContent==='300%'`);
    assert.equal(await evaluate(`${exprButton('Aumentar zoom')}.disabled`), true);
    await pdfReady();
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'zoom scroll is confined to reader');
    await button('Ajustar al ancho'); await pdfReady();
    assert.equal(await evaluate(`document.querySelector('output[aria-label="Zoom"]')?.textContent`), '100%');
    const fit = await evaluate(`(() => {const stage=document.querySelector('[aria-label="Documento; desplázate para leer"]'),page=document.querySelector('.react-pdf__Page');return {stage:stage.clientWidth,page:page.getBoundingClientRect().width};})()`);
    assert.ok(fit.page <= fit.stage && fit.page > fit.stage * 0.8, `fit to reader width: ${JSON.stringify(fit)}`);
    await button('Aumentar zoom'); await pdfReady();
    await evaluate(`document.querySelector('[aria-label="Documento; desplázate para leer"]').scrollTo({top:300,left:120})`);
    assert.ok(await evaluate(`document.querySelector('[aria-label="Documento; desplázate para leer"]').scrollTop>0`), 'reader was scrolled before reset');
    await button('Restablecer zoom y posición'); await pdfReady();
    assert.deepEqual(await evaluate(`(()=>{const s=document.querySelector('[aria-label="Documento; desplázate para leer"]');return {zoom:document.querySelector('output[aria-label="Zoom"]').textContent,top:s.scrollTop,left:s.scrollLeft};})()`), {zoom:'100%',top:0,left:0});
  });

  await check('Search continuity across every PDF page, active highlighting, match bounds and empty search', async () => {
    await navigate(pdfPath); await pdfReady();
    await typedSearch('CoNtInUiDaD');
    await wait(`!!document.querySelector(${text(matchOutput)}) && !!document.querySelector('mark[data-reader-match][data-active="true"]')`);
    const pages = new Set();
    let steps = 0;
    while (true) {
      const output = await evaluate(`document.querySelector(${text(matchOutput)}).textContent`);
      const page = Number(output.match(/página (\d+)/)?.[1]);
      pages.add(page); await pdfReady(page);
      await wait(`!!document.querySelector('mark[data-reader-match][data-active="true"]')`, `active highlight page ${page}`);
      assert.match(await evaluate(`document.querySelector('mark[data-active="true"]').textContent`), /continuidad/i);
      if (await evaluate(`${exprButton('Coincidencia siguiente')}.disabled`)) break;
      assert.ok(++steps < 50, 'bounded matches in demo fixture');
      await button('Coincidencia siguiente');
    }
    assert.deepEqual([...pages].sort(), [1, 2, 3], 'search covers all pages, not only current page');
    assert.equal(await evaluate(`${exprButton('Coincidencia siguiente')}.disabled`), true);
    while (!(await evaluate(`${exprButton('Coincidencia anterior')}.disabled`))) await button('Coincidencia anterior');
    assert.ok((await evaluate(`document.querySelector(${text(matchOutput)}).textContent`)).startsWith('1 de '));
    await typedSearch('no-existe-qa-784');
    await wait(`document.querySelector('form[role="search"] [role="status"]')?.textContent.includes('Sin coincidencias')`);
    assert.equal(await evaluate(`document.querySelectorAll('mark[data-reader-match]').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Coincidencias"]').length`), 0);
  });

  for (const [materialId, format] of [['demo-listado-calculo-3', 'png'], ['demo-apuntes-calculo', 'webp'], ['demo-certamen-calculo-1', 'jpeg']]) {
    await check(`Native ${format} full image and matching endpoint MIME`, async () => {
      await navigate(`/materiales/${materialId}`); await imageReady();
      const image = await evaluate(`(() => {const i=document.querySelector(${text(`${reader} img`)}),s=getComputedStyle(i),r=i.getBoundingClientRect();return {alt:i.alt,width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,objectFit:s.objectFit,src:i.currentSrc};})()`);
      assert.ok(image.alt.length > 0);
      assert.ok(Math.abs(image.width / image.height - image.naturalWidth / image.naturalHeight) < 0.01, 'no cropped/stretched image');
      assert.ok(!['cover', 'none'].includes(image.objectFit), 'image remains fully visible');
      assert.ok(report.responses.some(row => row.url === image.src && row.status === 200 && row.mimeType === `image/${format}`));
      assert.equal(await evaluate(`document.querySelectorAll(${text(`${reader} canvas`)}).length`), 0);
    });
  }

  await check('Real download link click produces normalized PDF filename and exact bytes on disk', async () => {
    await navigate(pdfPath); await pdfReady();
    const started = report.downloads.length;
    await click('main a[download]');
    const download = await localWait(() => report.downloads.slice(started).find(row => row.state === 'completed'), 'browser download completed');
    assert.equal(download.suggestedFilename, 'Certamen 2 - 2024-2.pdf');
    assert.equal(download.url, new URL(`${pdfPath}/archivo?descargar=1`, base).href);
    const actual = await readFile(resolve(downloads, download.guid));
    const expected = await readFile(resolve(root, 'public/demo/calculo-certamen-demo.pdf'));
    assert.deepEqual(actual, expected, 'click saved the fixture bytes, not HTML');
  });

  await check('Local report: keyboard focus trap, validation, Escape/return focus, no network/storage', async () => {
    await navigate(pdfPath); await pdfReady(); await sleep(300);
    const storage = await evaluate('JSON.stringify({local:{...localStorage},session:{...sessionStorage}})');
    const start = report.requests.length;
    await focusButton('Reportar material'); await press('Enter');
    await wait(`document.querySelector('dialog')?.open && document.activeElement?.name==='reason'`);
    await focus('dialog button[type="submit"]'); await press('Enter');
    assert.equal(await evaluate(`document.querySelector('dialog select').validity.valueMissing`), true);
    assert.ok(!await evaluate(`document.querySelector('dialog [role="status"]')?.textContent.includes('revisada')`));
    for (let i = 0; i < 7; i++) {
      await press('Tab');
      let active = await evaluate(`(() => {const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {inside:!!e.closest('dialog'),visible:r.width>0&&r.height>0,tag:e.tagName,outline:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow,focusVisible:e.matches(':focus-visible')};})()`);
      report.keyboard.push({ type: 'report-dialog', ...active });
      // Native <dialog> may yield focus to browser chrome (BODY in CDP), but
      // underlying app controls must remain inert and the next Tab reenters it.
      if(active.tag==='BODY') {
        await press('Tab');
        active=await evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {inside:!!e.closest('dialog'),visible:r.width>0&&r.height>0,tag:e.tagName,outline:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow,focusVisible:e.matches(':focus-visible')};})()`);
        report.keyboard.push({type:'report-dialog-return-from-browser-chrome',...active});
      }
      assert.ok(active.inside && active.visible, 'Tab never enters background app controls');
      assert.ok(active.focusVisible && ((active.outline !== 'none' && parseFloat(active.width) > 0) || active.shadow !== 'none'), 'visible keyboard focus');
    }
    await focus('dialog select'); await press('End'); await press('Tab');
    await call('Input.insertText', { text: 'Prueba QA local, sin datos personales.' });
    await focus('dialog button[type="submit"]'); await press('Enter');
    await wait(`document.querySelector('dialog [role="status"]')?.textContent.includes('No se envió ni se guardó')`);
    await press('Escape');
    await wait(`!document.querySelector('dialog').open && document.activeElement?.textContent.trim()==='Reportar material'`);
    await press('Enter');
    await wait(`document.querySelector('dialog')?.open && !!document.querySelector('dialog select')`);
    assert.equal(await evaluate(`document.querySelector('dialog textarea').value`), '');
    assert.equal(await evaluate(`document.querySelector('dialog select').value`), '');
    await press('Escape'); await sleep(100);
    assert.deepEqual(report.requests.slice(start).filter(row => ['Fetch', 'XHR', 'Document'].includes(row.type)), [], 'report never sends requests');
    assert.equal(await evaluate('JSON.stringify({local:{...localStorage},session:{...sessionStorage}})'), storage, 'report never stores information');
  });

  await check('Fullscreen through trusted click and keyboard exit, or explicit supported fallback', async () => {
    await navigate(pdfPath); await pdfReady();
    await button('Pantalla completa');
    await wait(`!!document.fullscreenElement || [...document.querySelectorAll(${text(`${reader} [role="status"]`)})].some(e=>/pantalla completa/.test(e.textContent))`);
    const supported = await evaluate('!!document.fullscreenElement');
    if (!supported) {
      const message = await evaluate(`[...document.querySelectorAll(${text(`${reader} [role="status"]`)})].map(e=>e.textContent).join(' ')`);
      report.limitations.push(`Fullscreen API unavailable/refused by this Chromium environment; checked visible fallback only: ${message}`);
      assert.match(message, /no permite pantalla completa|No se pudo abrir pantalla completa/);
    } else {
      assert.equal(await evaluate('document.fullscreenElement.getAttribute("aria-label")'), 'Lector: Certamen 2 - 2024-2');
      await snapshot('pdf-fullscreen', false);
      await focusButton('Salir de pantalla completa'); await press('Enter');
      await wait('!document.fullscreenElement', 'keyboard exits fullscreen');
      await pdfReady();
    }
  });

  await check('Unavailable metadata and unknown material show useful states with no fake download', async () => {
    for (const materialId of ['demo-listado-algebra-1', 'demo-certamen-calculo-2-seccion-2']) {
      await navigate(`/materiales/${materialId}`);
      assert.ok(await evaluate(`document.querySelector('main').textContent.includes('Archivo no disponible')`));
      assert.equal(await evaluate(`document.querySelectorAll('main a[download],main a[href*="/archivo"],main canvas,main section[aria-label^="Lector:"]').length`), 0);
    }
    await navigate('/materiales/no-existe');
    assert.equal(await evaluate(`document.querySelectorAll('main a[download],main canvas').length`), 0);
    assert.ok(await evaluate(`!!document.querySelector('main a[href="/"]') || /encontra|existe|disponible/i.test(document.querySelector('main').textContent)`));
  });

  for (const [name, materialId, status, mimeType] of [
    ['corrupt-pdf', pdfId, 200, 'application/pdf'],
    ['missing-pdf', pdfId, 404, 'text/plain'],
    ['corrupt-png', 'demo-listado-calculo-3', 200, 'image/png'],
  ]) {
    await check(`CDP Fetch ${name}: accessible failure, retry recovers real file`, async () => {
      const before = report.requests.length;
      let intercepted = 0;
      injecting = true;
      const handler = async (event, sid) => {
        if (sid !== session) return;
        try {
          if (event.request.url.split('?')[0] === new URL(`/materiales/${materialId}/archivo`, base).href) {
            intercepted++;
            await call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: mimeType }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from('QA intercepted invalid document bytes; no public corrupt asset').toString('base64') });
          } else await call('Fetch.continueRequest', { requestId: event.requestId });
        } catch (error) { interceptionError = error; }
      };
      // Each handler is gated by an active closure; old listeners never consume later paused requests.
      let active = true;
      rpc.on('Fetch.requestPaused', (event, sid) => { if (active) void handler(event, sid); });
      try {
        await call('Fetch.enable', { patterns: [{ urlPattern: `*${`/materiales/${materialId}/archivo`}*`, requestStage: 'Request' }] });
        await navigate(`/materiales/${materialId}`);
        await wait(`!!document.querySelector(${text(`${reader} [role="alert"]`)})`, `reader failure alert after injected bytes (interceptions=${intercepted})`, 12000);
        assert.ok(intercepted > 0, 'CDP intercepted the actual document request');
        assert.ok(!interceptionError, interceptionError?.message);
        assert.ok(await evaluate(`document.querySelector(${text(`${reader} [role="alert"]`)}).textContent.includes('Reintentar')`));
        assert.ok(await evaluate(`!!document.querySelector('main a[download]')`), 'download remains available despite viewer error');
        await snapshot(`injected-${name}`);
        await call('Fetch.disable'); active = false;
        await button('Reintentar');
        if (materialId === pdfId) await pdfReady(); else await imageReady();
        await wait(`!document.querySelector(${text(`${reader} [role="alert"]`)})`, 'retry clears error');
        assert.ok(report.requests.slice(before).filter(row => row.url.includes(`/materiales/${materialId}/archivo`)).length >= 2, 'retry issues a fresh read');
      } finally {
        active = false;
        await call('Fetch.disable');
        await sleep(150);
        injecting = false;
      }
    });
  }

  await check('Course filters → material → return and two back/forward cycles preserve context and live PDF transport', async () => {
    const course = '/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2';
    const materialQuery = '?tipo=certamenes&anio=2024&periodo=2&numero=2';
    const courseReady = `location.pathname==='/ramos/calculo-i' && location.search===${text(materialQuery)} && document.querySelectorAll('main article').length===2 && document.querySelector('#course-year')?.value==='2024' && document.querySelector('#course-term')?.value==='2' && document.querySelector('#course-number')?.value==='2'`;
    const materialReady = `location.pathname===${text(pdfPath)} && location.search===${text(materialQuery)}`;
    await navigate(course);
    await click(`main a[href^="${pdfPath}?"]`);
    await wait(materialReady);
    report.navigationCheckpoint = 'first client-side click into material';
    await pdfReady();
    report.navigationCycles = [];
    for (let cycle = 1; cycle <= 2; cycle++) {
      const links = await evaluate(`[...document.querySelectorAll('main a')].filter(e=>e.textContent.includes('Volver a Cálculo')).map(e=>e.getAttribute('href'))`);
      assert.deepEqual(links, [course], `cycle ${cycle}: return URL preserves every filter`);
      report.navigationCheckpoint = `cycle ${cycle}: return link from material to course`;
      await click(`main > a[href="${course}"]`);
      await wait(courseReady, `cycle ${cycle}: return link preserves filtered course`);

      report.navigationCheckpoint = `cycle ${cycle}: back from return-link course to material`;
      await evaluate('history.back()');
      await wait(materialReady);
      await pdfPage(1);
      // Exercise PDFDocumentProxy after restoring, not just a retained canvas.
      // A destroyed transport can display old pixels but fail getPage().
      await button('Página siguiente'); await pdfPage(2);
      await button('Página anterior'); await pdfPage(1);

      report.navigationCheckpoint = `cycle ${cycle}: back from material to original course`;
      await evaluate('history.back()');
      await wait(courseReady, `cycle ${cycle}: back preserves original filtered course`);
      report.navigationCheckpoint = `cycle ${cycle}: forward from original course to material`;
      await evaluate('history.forward()');
      await wait(materialReady);
      await pdfPage(1);
      await button('Página siguiente'); await pdfPage(2);
      await button('Página anterior'); await pdfPage(1);
      report.navigationCycles.push({ cycle, filtersPreserved: true, backPages: [1, 2, 1], forwardPages: [1, 2, 1] });
    }
  });

  for (const width of [375, 768, 1280, 1440]) for (const dark of [false, true]) for (const [name, materialId] of [['pdf', pdfId], ['image', 'demo-listado-calculo-3'], ['unavailable', 'demo-certamen-calculo-2-seccion-2']]) {
    await check(`Responsive ${name} ${width}px ${dark ? 'dark' : 'light'}, contrast and screenshot`, async () => {
      await viewport(width); await navigate(`/materiales/${materialId}`); await theme(dark);
      if (name === 'pdf') await pdfReady(); else if (name === 'image') await imageReady();
      const layout = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,headings:[...document.querySelectorAll('main h1,main h2')].map(e=>({text:e.textContent,client:e.clientWidth,scroll:e.scrollWidth})),controls:[...document.querySelectorAll('[aria-label="Controles del lector"] button')].map(e=>({name:e.getAttribute('aria-label')||e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})`);
      report.responsive.push({ name, dark, ...layout });
      await snapshot(`materials-${name}-${width}-${dark ? 'dark' : 'light'}`);
      assert.ok(layout.scroll <= width && layout.body <= width, `page horizontal overflow: ${JSON.stringify(layout)}`);
      assert.ok(layout.headings.every(row => row.scroll <= row.client), 'headings are not clipped');
      assert.ok(layout.controls.every(row => row.width >= 44 && row.height >= 44), 'reader touch controls at least 44px');
      const contrast = await evaluate(`(() => {
        const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number);
        const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
        const out=[];
        for(const e of document.querySelectorAll('main h1,main h2,main p,main dt,main dd,main label,main a,main button,main output')) {
          const r=e.getBoundingClientRect();if(r.width<2||r.height<2||e.closest('.textLayer')||e.closest('[disabled]'))continue;
          const s=getComputedStyle(e);let bg=rgb(s.backgroundColor),p=e.parentElement;
          while((bg[3]??1)===0&&p){bg=rgb(getComputedStyle(p).backgroundColor);p=p.parentElement}
          const fg=rgb(s.color);if(fg.length<3||bg.length<3||(bg[3]??1)<1||(fg[3]??1)<1)continue;
          const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
          out.push({tag:e.tagName,text:e.textContent.trim().slice(0,70),ratio,required:large?3:4.5});
        }return out;
      })()`);
      report.contrast.push({ name, width, dark, samples: contrast.length, failures: contrast.filter(row => row.ratio < row.required) });
      assert.ok(contrast.length >= 10, 'contrast samples populated');
      assert.deepEqual(contrast.filter(row => row.ratio < row.required), [], 'opaque UI text meets AA');
    });
  }

  await check('Real Tab reaches reader/search/report/download, no hidden focus and visible outlines', async () => {
    await viewport(1280); await navigate(pdfPath); await pdfReady();
    await focus('a[href="#contenido"]');
    const rows = [];
    for (let i = 0; i < 40; i++) {
      await press('Tab');
      rows.push(await evaluate(`(() => {const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,name:e.getAttribute('aria-label')||e.textContent.trim().slice(0,70),href:e.getAttribute('href'),download:e.hasAttribute('download'),search:e.matches('input[type="search"]'),visible:r.width>0&&r.height>0,outline:s.outlineStyle,outlineWidth:s.outlineWidth,shadow:s.boxShadow,focusVisible:e.matches(':focus-visible')};})()`));
    }
    report.keyboard.push({ type: 'material-page-tab', rows });
    assert.ok(rows.some(row => row.download));
    assert.ok(rows.some(row => row.name === 'Reportar material'));
    assert.ok(rows.some(row => row.search));
    assert.ok(rows.some(row => row.name === 'Documento; desplázate para leer'));
    assert.ok(rows.every(row => row.visible), 'no hidden tab stops');
    assert.ok(rows.filter(row => row.tag !== 'BODY').every(row => row.focusVisible && ((row.outline !== 'none' && parseFloat(row.outlineWidth) > 0) || row.shadow !== 'none')), 'all reached controls have visible keyboard focus');
  });

  await check('No unexpected hydration/runtime/network errors, fake worker or external document resources', async () => {
    assert.deepEqual(report.browserErrors, []);
    assert.deepEqual(report.networkFailures, []);
    assert.ok(!report.consoleWarnings.filter(row => !row.injected).some(row => /fake worker/i.test(row.text)));
    const documentResources = report.responses.filter(row => /\/archivo|pdf.*worker|\/pdfjs\//i.test(row.url));
    assert.ok(documentResources.length > 0);
    assert.deepEqual(documentResources.filter(row => new URL(row.url).origin !== base.origin), [], 'documents, worker and PDF support files stay local');
  });
} catch (error) {
  report.fatal = { error: error.message, stack: error.stack };
  console.error(`BLOCKED ${error.stack}`);
} finally {
  report.limitations.push('Computed contrast samples cover opaque UI text only, not PDF/image contents, alpha compositing or a full WCAG audit.');
  report.limitations.push('Fixture-only checks are not authorization/RLS, upload validation or real moderation tests; no backend/users exist in this milestone.');
  report.finished = new Date().toISOString();
  report.summary = { passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, screenshots: report.screenshots.length, browserErrors: report.browserErrors.length, expectedErrors: report.expectedErrors.length, networkFailures: report.networkFailures.length };
  await writeFile(resolve(artifacts, 'browser-materials-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  console.log(`Report: ${resolve(artifacts, 'browser-materials-report.json')}`);
  if (rpc && socket?.readyState === WebSocket.OPEN) { try { await rpc.send('Browser.close'); } catch {} }
  socket?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGTERM'); await Promise.race([exited, sleep(3000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
}
if (report.fatal || report.summary.failed) process.exitCode = 1;
