/**
 * Opt-in real Chromium QA, no third-party dependencies and no build/server lifecycle.
 * WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-catalog.mjs
 * Optional: WIKI_CHROME_PATH=/absolute/path/to/chrome
 * Artifacts/profile stay inside this project's .next directory.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = new URL(process.env.WIKI_TEST_BASE_URL || 'http://127.0.0.1:3100');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'This fixture-only runner requires a loopback origin.');
const artifacts = resolve(root, '.next/qa-evidence');
const profile = resolve(root, '.next/qa-browser-profile');
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
const report = { started: new Date().toISOString(), base: base.href, executable, sandbox: 'enabled', checks: [], screenshots: [], browserErrors: [], consoleWarnings: [], networkFailures: [], keyboard: [], responsive: [], contrast: [] };
let chrome;
let socket;
let rpc;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => JSON.stringify(value);
const visibleCards = `([...document.querySelectorAll('main article')].filter(e => e.getClientRects().length > 0))`;
const materialStatus = `([...document.querySelectorAll('main section [role="status"]')].find(e => e.getClientRects().length > 0))`;

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
  // Header SSR fallback can look complete before React installs click/keyboard handlers.
  await wait(`(()=>{const buttons=[...document.querySelectorAll('button[aria-label="Tema oscuro"]')];const e=buttons[0];return buttons.length===1 && e.getClientRects().length && Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k].onClick==='function') && ![...document.querySelectorAll('[hidden][id]')].some(e=>e.id.startsWith('S:')) && e.getAttribute('aria-pressed')===String(document.documentElement.classList.contains('dark'))})()`, 'unique hydrated header and settled Suspense');
}
async function press(key, modifiers = 0) {
  const codes = { Tab: 9, Enter: 13, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, ' ': 32 };
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
async function courseState(count, query = {}) {
  await wait(`(() => { const p = new URL(location.href).searchParams; return ${Object.entries(query).map(([key, value]) => `p.get(${text(key)})===${text(value)}`).join(' && ') || 'true'} && ${visibleCards}.length===${count} && ${materialStatus}?.textContent.includes(${text(`${count} material`)}); })()`, `course ${count} cards / ${JSON.stringify(query)}`);
  await wait(`!document.querySelector('form[aria-label="Filtrar materiales del ramo"] [role="status"]')?.textContent.includes('Actualizando')`, 'transition settled');
}
async function selectEnd(id, expected) {
  await focus(`#${id}`);
  await press('End');
  await press('Tab');
  await wait(`document.querySelector('#${id}')?.value===${text(expected)}`, `keyboard select ${id}=${expected}`);
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
    try { state = await evaluate(`({url:location.href,title:document.title,h1:document.querySelector('h1')?.innerText,cards:${visibleCards}.length,selects:[...document.querySelectorAll('select')].map(s=>({id:s.id,value:s.value})),active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent?.slice(0,80)},focusEvents:window.__qaFocusEvents,body:document.querySelector('main')?.innerText?.slice(0,2200)})`); } catch {}
    report.checks.push({ name, pass: false, ms: Date.now() - start, error: error.message, state });
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

try {
  // Reachability check only; does not start/restart or poll the user's server.
  const response = await fetch(base, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, 'Production server unavailable');
  let wsUrl;
  try { wsUrl = await launch(); }
  catch (error) {
    if (!/sandbox|namespace|Operation not permitted/i.test(error.message)) throw error;
    report.sandbox = 'disabled only for this ephemeral local fixture browser: sandbox/namespace blocked by environment';
    report.sandboxFailure = error.message;
    if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGTERM'); await new Promise(resolve => chrome.once('exit', resolve)); }
    wsUrl = await launch(true);
  }
  socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  rpc = connection(socket);
  report.browserVersion = await rpc.send('Browser.getVersion');
  const { targetId } = await rpc.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await rpc.send('Target.attachToTarget', { targetId, flatten: true }));
  rpc.on('Runtime.exceptionThrown', (event, sid) => { if (sid === session) report.browserErrors.push({ type: 'exception', ...event.exceptionDetails }); });
  rpc.on('Runtime.consoleAPICalled', (event, sid) => {
    if (sid !== session) return;
    const row = { type: event.type, text: event.args.map(arg => arg.value ?? arg.description ?? '').join(' '), stack: event.stackTrace };
    if (event.type === 'error') report.browserErrors.push(row);
    if (event.type === 'warning') report.consoleWarnings.push(row);
  });
  rpc.on('Log.entryAdded', (event, sid) => { if (sid === session && event.entry.level === 'error') report.browserErrors.push({ type: 'log', ...event.entry }); });
  rpc.on('Network.loadingFailed', (event, sid) => { if (sid === session && !event.canceled && event.errorText !== 'net::ERR_ABORTED') report.networkFailures.push(event); });
  for (const method of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await call(method);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Network.clearBrowserCache');
  await viewport(1280);

  await check('Real clicks: Inicio → semestre 1 → Cálculo I → categorías', async () => {
    await navigate('/');
    // A visible theme click and state assertion also ensures client hydration completed.
    await theme(true); await theme(false);
    await click('a[href="/semestres/1"]');
    await wait(`location.pathname==='/semestres/1' && document.querySelector('h1')?.textContent==='Semestre curricular 1'`);
    await click('main a[href="/ramos/calculo-i"]');
    await courseState(1);
    await click('nav[aria-label="Categorías de materiales"] a[href*="tipo=apuntes"]');
    await courseState(1, { tipo: 'apuntes' });
    assert.ok(await evaluate(`document.querySelector('main article')?.innerText.includes('Apuntes - 2025-2')`));
    await click('nav[aria-label="Categorías de materiales"] a[href*="tipo=certamenes"]');
    await courseState(3, { tipo: 'certamenes' });
    assert.equal(await evaluate(`document.querySelector('nav[aria-label="Categorías de materiales"] a[aria-current="page"]')?.textContent`), 'Certámenes');
  });

  await check('Native keyboard selects combine AND and preserve curricular semester', async () => {
    await navigate('/ramos/calculo-i?tipo=certamenes');
    await selectEnd('course-year', '2024');
    await courseState(3, { tipo: 'certamenes', anio: '2024' });
    await selectEnd('course-term', '2');
    await courseState(2, { tipo: 'certamenes', anio: '2024', periodo: '2' });
    await selectEnd('course-number', '2');
    await courseState(2, { tipo: 'certamenes', anio: '2024', periodo: '2', numero: '2' });
    const rows = await evaluate(`${visibleCards}.map(a=>a.innerText)`);
    assert.ok(rows.every(row => row.includes('Certamen 2 - 2024-2') && row.includes('Semestre curricular 1')));
    assert.ok(rows[0].includes('Sección 1') && rows[1].includes('Sección 2'));
    const shared = await evaluate('location.href');
    await call('Page.reload');
    await wait(`document.readyState==='complete' && document.querySelector('#course-number')?.value==='2'`);
    await courseState(2, { anio: '2024', periodo: '2', numero: '2' });
    assert.equal(await evaluate('location.href'), shared);
  });

  await check('Category preserves filters; clear retains category; real back/forward', async () => {
    await navigate('/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2');
    await click('nav[aria-label="Categorías de materiales"] a[href*="tipo=apuntes"]');
    await courseState(0, { tipo: 'apuntes', anio: '2024', periodo: '2', numero: '2' });
    assert.ok(await evaluate(`document.querySelector('main').innerText.includes('No encontramos materiales con estos filtros')`));
    await click('form[aria-label="Filtrar materiales del ramo"] a');
    await courseState(1, { tipo: 'apuntes' });
    assert.equal(await evaluate('location.search'), '?tipo=apuntes');
    await evaluate('history.back()');
    await courseState(0, { tipo: 'apuntes', anio: '2024', periodo: '2', numero: '2' });
    await evaluate('history.back()');
    await courseState(2, { tipo: 'certamenes', anio: '2024', periodo: '2', numero: '2' });
    await evaluate('history.forward()');
    await courseState(0, { tipo: 'apuntes', anio: '2024', periodo: '2', numero: '2' });
    await evaluate('history.forward()');
    await courseState(1, { tipo: 'apuntes' });
  });

  await check('Rapid consecutive keyboard filter changes do not lose prior choices', async () => {
    await navigate('/ramos/calculo-i?tipo=certamenes');
    for (const id of ['course-year', 'course-term', 'course-number']) { await focus(`#${id}`); await press('End'); }
    await press('Tab');
    await courseState(2, { tipo: 'certamenes', anio: '2024', periodo: '2', numero: '2' });
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('form select')].map(s=>s.value)`), ['2024', '2', '2']);
  });

  await check('Semester search with real typing/Enter and clear', async () => {
    await navigate('/semestres/1');
    await click('#course-query');
    await call('Input.insertText', { text: 'CALCULO' });
    await press('Enter');
    await wait(`location.search==='?q=CALCULO' && ${visibleCards}.length===1 && !!document.querySelector('main a[href="/ramos/calculo-i"]')`);
    await click('#course-query');
    await press('Home');
    // Ctrl+A is a real browser editing shortcut; do not mutate input.value.
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, commands: ['selectAll'] });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await call('Input.insertText', { text: 'sin-coincidencias' });
    await press('Enter');
    await wait(`location.search.includes('sin-coincidencias') && document.querySelector('main')?.innerText.includes('No encontramos ramos')`);
    await click('main a[href="/semestres/1"]');
    await wait(`location.pathname==='/semestres/1' && !location.search && ${visibleCards}.length===2`);
  });

  await check('Rendered invalid-filter alert, semester/category empty states and private search', async () => {
    await navigate('/ramos/calculo-i?periodo=3');
    assert.ok(await evaluate(`!!document.querySelector('main [role="alert"]') && ${visibleCards}.length===0`));
    await navigate('/semestres/4');
    assert.ok(await evaluate(`${visibleCards}.length===0 && document.querySelector('main')?.innerText.includes('no hay ramos de ejemplo')`));
    await navigate('/ramos/geometria?tipo=certamenes');
    assert.ok(await evaluate(`[...document.querySelectorAll('nav[aria-label="Categorías de materiales"] a')].filter(e=>e.getClientRects().length>0).length===3 && ${visibleCards}.length===0`));
    await navigate('/?q=MARCADOR_PRIVADO');
    assert.equal(await evaluate(`${visibleCards}.length`), 0);
  });

  await check('Elective area Todas preserves the current search query', async () => {
    await navigate('/electivos?area=numerico&q=simulacion');
    const allSelector = 'nav[aria-label="Áreas de electivos"] a:first-child';
    await wait(`!!document.querySelector(${text(allSelector)})?.getClientRects().length`);
    const href = await evaluate(`document.querySelector(${text(allSelector)}).getAttribute('href')`);
    const destination = new URL(href, base);
    assert.equal(destination.searchParams.get('q'), 'simulacion');
    assert.equal(destination.searchParams.get('area'), null);
    await click(allSelector);
    await wait(`location.pathname==='/electivos' && new URL(location.href).searchParams.get('q')==='simulacion' && !new URL(location.href).searchParams.has('area') && document.querySelector('#elective-q')?.value==='simulacion'`);
  });

  await check('Real Tab skip link, focus visibility and desktop keyboard order', async () => {
    await viewport(1280); await navigate('/');
    // Reset focus to document without focusing an individual control.
    await evaluate(`document.activeElement?.blur(); window.scrollTo(0,0)`);
    await press('Tab');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('href')`), '#contenido');
    await press('Enter');
    await wait(`document.activeElement?.id==='contenido'`, 'skip link focuses main');
    await navigate('/ramos/calculo-i?tipo=certamenes');
    await focus('a[href="#contenido"]');
    const seen = [];
    for (let i = 0; i < 24; i++) {
      await press('Tab');
      seen.push(await evaluate(`(() => {const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,name:e.getAttribute('aria-label')||e.textContent.trim().slice(0,80),href:e.getAttribute('href'),outline:s.outlineStyle,outlineWidth:s.outlineWidth,shadow:s.boxShadow,visible:r.width>0&&r.height>0,focusVisible:e.matches(':focus-visible')};})()`));
    }
    report.keyboard.push({ viewport: 1280, steps: seen });
    assert.ok(seen.some(row => row.id === 'course-year'));
    assert.ok(seen.some(row => row.id === 'course-term'));
    assert.ok(seen.some(row => row.id === 'course-number'));
    assert.ok(seen.some(row => row.name === 'Certámenes'));
    assert.ok(seen.every(row => row.visible), 'Tab never enters hidden controls');
    assert.ok(seen.filter(row => row.tag !== 'BODY').every(row => row.focusVisible && ((row.outline !== 'none' && parseFloat(row.outlineWidth) > 0) || row.shadow !== 'none')), 'Every reached control has visible focus styling');
  });

  await check('Mobile keyboard menu: Tab, Enter, Escape, focus return, link activation', async () => {
    await viewport(375); await navigate('/');
    await evaluate(`window.__qaFocusEvents=[]; for(const type of ['focusin','focusout','click'])document.addEventListener(type,e=>window.__qaFocusEvents.push({type,target:e.target.tagName,id:e.target.id,text:e.target.textContent?.slice(0,35),time:performance.now()}),true)`);
    await focus('button[aria-label="Tema oscuro"]');
    await press('Tab');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Navegación principal');
    await press('Enter');
    await wait(`document.querySelector('button[aria-label="Navegación principal"]')?.getAttribute('aria-expanded')==='true'`);
    await press('Tab');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('href')`), '/#explorar');
    await snapshot('mobile-menu-keyboard-focus', false);
    await press('Escape');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Navegación principal');
    assert.equal(await evaluate(`document.querySelector('button[aria-label="Navegación principal"]')?.getAttribute('aria-expanded')`), 'false');
    await press('Enter'); await press('Tab'); await press('Enter');
    await wait(`location.hash==='#explorar' && document.activeElement?.id==='explorar'`);
    assert.equal(await evaluate(`document.querySelector('button[aria-label="Navegación principal"]')?.getAttribute('aria-expanded')`), 'false');
  });

  await check('Theme toggle by keyboard persists after reload', async () => {
    await navigate('/semestres/1'); await theme(false);
    await focus('button[aria-label="Tema oscuro"]'); await press(' ');
    await wait(`document.documentElement.classList.contains('dark')`);
    await call('Page.reload');
    await wait(`document.readyState==='complete' && document.documentElement.classList.contains('dark') && document.querySelector('button[aria-label="Tema oscuro"]')?.getAttribute('aria-pressed')==='true'`);
    await theme(false);
  });

  for (const width of [375, 768, 1280, 1440]) for (const dark of [false, true]) for (const [page, path] of [['semestre', '/semestres/1'], ['ramo', '/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2']]) {
    await check(`Responsive ${page} ${width}px ${dark ? 'dark' : 'light'} + screenshot`, async () => {
      await viewport(width); await navigate(path); await theme(dark);
      const layout = await evaluate(`(() => {const w=innerWidth;return {width:w,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>w+1)&&getComputedStyle(e).position!=='absolute'}).slice(0,12).map(e=>({tag:e.tagName,id:e.id,text:e.innerText?.slice(0,80),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),headings:[...document.querySelectorAll('h1,h2')].map(e=>({text:e.innerText,client:e.clientWidth,scroll:e.scrollWidth})),menuVisible:document.querySelector('button[aria-label="Navegación principal"]').getBoundingClientRect().width>0};})()`);
      report.responsive.push({ page, dark, ...layout });
      await snapshot(`${page}-${width}-${dark ? 'dark' : 'light'}`);
      assert.ok(layout.scrollWidth <= width && layout.bodyScrollWidth <= width, `horizontal overflow: ${JSON.stringify(layout)}`);
      assert.ok(layout.headings.every(heading => heading.scroll <= heading.client), 'headings not clipped horizontally');
      assert.equal(layout.menuVisible, width < 1024);
      const contrast = await evaluate(`(() => {
        const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number);
        const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
        const results=[];
        for(const e of document.querySelectorAll('main h1,main h2,main h3,main p,main label,main a,main select')) {
          if(!e.getBoundingClientRect().width)continue;
          const style=getComputedStyle(e);let bg=rgb(style.backgroundColor),parent=e.parentElement;
          while((bg[3]??1)===0&&parent){bg=rgb(getComputedStyle(parent).backgroundColor);parent=parent.parentElement}
          const fg=rgb(style.color);if(fg.length<3||bg.length<3||(bg[3]??1)<1||(fg[3]??1)<1)continue;
          const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
          results.push({tag:e.tagName,text:e.textContent.trim().slice(0,70),ratio:Math.round(ratio*100)/100,required:large?3:4.5,color:style.color,background:bg});
        }return results;
      })()`);
      report.contrast.push({ page, width, dark, samples: contrast.length, minimumRatio: Math.min(...contrast.map(row => row.ratio)), failures: contrast.filter(row => row.ratio < row.required) });
      assert.ok(contrast.length > 10, 'computed-style contrast sample populated');
      assert.deepEqual(contrast.filter(row => row.ratio < row.required), [], 'opaque rendered text samples meet AA');
    });
  }
  await check('No browser JS/hydration errors or failed network resources', async () => {
    assert.deepEqual(report.browserErrors, []);
    assert.deepEqual(report.networkFailures, []);
  });
} catch (error) {
  report.fatal = { error: error.message, stack: error.stack };
  console.error(`BLOCKED ${error.stack}`);
} finally {
  report.finished = new Date().toISOString();
  report.summary = { passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, screenshots: report.screenshots.length, browserErrors: report.browserErrors.length, networkFailures: report.networkFailures.length };
  await writeFile(resolve(artifacts, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  console.log(`Report: ${resolve(artifacts, 'browser-report.json')}`);
  // Only close the Chromium instance launched above. Never touch Next/server processes.
  if (rpc && socket?.readyState === WebSocket.OPEN) { try { await rpc.send('Browser.close'); } catch {} }
  socket?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(3000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
}
if (report.fatal || report.summary.failed) process.exitCode = 1;
