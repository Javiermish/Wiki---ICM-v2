/**
 * Native Chromium/CDP QA for the in-memory contribution demo; no dependencies.
 * WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-contributions.mjs
 * Optional WIKI_CHROME_PATH. Requires an already-running loopback server.
 * Never starts a server, installs a browser, or weakens Chromium's sandbox.
 * Evidence: .next/qa-contributions-evidence/{*.png,browser-contributions-report.json}.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Transport and trusted input helpers follow tests/browser-materials.mjs. That
// executable runner cannot be imported without running its unrelated scenarios.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, '.next/qa-contributions-evidence');
const report = { started: new Date().toISOString(), status: 'RUNNING', sandbox: 'enabled', checks: [], screenshots: [], requests: [], responses: [], preventedRequests: [], browserErrors: [], expectedErrors: [], networkFailures: [], warnings: [], objectURLs: [], persistenceCalls: [], responsive: [], keyboard: [], contrast: [], limitations: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = JSON.stringify;
const path = '/aportar?ramo=calculo-i';
const reader = 'section[aria-label^="Lector:"]';
const pageOutput = `${reader} [aria-label="Controles del lector"] output:not([aria-label])`;
const fileInput = '#contribution-file';
const courseRadio = 'input[name="courseId"][value="demo-calculo-i"]';
const confirmation = 'Simulación completada. Ningún archivo fue enviado. El sistema de aportes estará disponible cuando se active la autenticación y el almacenamiento.';
const successExpression = `[...document.querySelectorAll('main [role="status"]')].find(e=>e.textContent.trim()===${text(confirmation)})`;
const errors = '[role="alert"][aria-labelledby="contribution-errors-heading"]';
let base, executable, profile, chrome, socket, rpc, session, currentDocument;
let injecting = false;
let interceptionError;
let holdScripts = false;
let pendingFixtureURLCount = null;
const heldScripts = [];

async function launch() {
  const browserHome = resolve(profile, 'home');
  for (const dir of [browserHome, resolve(profile, 'config'), resolve(profile, 'cache'), resolve(profile, 'tmp')]) await mkdir(dir, { recursive: true });
  const args = ['--headless', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-breakpad', '--disable-crash-reporter', '--password-store=basic', '--use-mock-keychain', '--window-size=1280,900', 'about:blank'];
  report.launchArgs = args;
  chrome = spawn(executable, args, { cwd: root, env: { ...process.env, HOME: browserHome, XDG_CONFIG_HOME: resolve(profile, 'config'), XDG_CACHE_HOME: resolve(profile, 'cache'), TMPDIR: resolve(profile, 'tmp') }, stdio: ['ignore', 'ignore', 'pipe'] });
  return await new Promise((resolve, reject) => {
    let stderr = '';
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
  const pending = new Map(), listeners = new Map();
  ws.addEventListener('message', message => {
    const packet = JSON.parse(message.data);
    if (packet.id) {
      const request = pending.get(packet.id);
      if (!request) return;
      pending.delete(packet.id); clearTimeout(request.timer);
      if (packet.error) request.reject(new Error(`${request.method}: ${JSON.stringify(packet.error)}`));
      else request.resolve(packet.result);
    } else for (const listener of listeners.get(packet.method) ?? []) listener(packet.params, packet.sessionId);
  });
  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const messageId = ++id;
        const timer = setTimeout(() => { pending.delete(messageId); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(messageId, { resolve, reject, timer, method });
        ws.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(method, listener) { listeners.set(method, [...(listeners.get(method) ?? []), listener]); },
  };
}
const call = (method, params = {}) => rpc.send(method, params, session);
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function wait(expression, description = expression, timeout = 15000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { last = await evaluate(expression); if (last) return last; } catch (error) { last = error.message; }
    await sleep(80);
  }
  throw new Error(`Wait failed: ${description}; last=${JSON.stringify(last)}`);
}
async function navigate(url = path) {
  const { errorText } = await call('Page.navigate', { url: new URL(url, base).href });
  assert.ok(!errorText, errorText);
  await wait(`document.readyState==='complete' && !!document.querySelector('main h1')`, `page ${url}`);
  currentDocument = await evaluate('window.__qaContributionDocument');
  assert.ok(currentDocument, 'Native telemetry installed before page scripts');
  if (new URL(url, base).pathname === '/aportar') await wait(`!!document.querySelector(${text(courseRadio)}) && !!document.querySelector(${text(fileInput)}) && !document.querySelector('#contribution-category').matches(':disabled')`, 'hydrated contribution controls');
  await evaluate('document.fonts.ready.then(() => true)');
  // The course picker is a client component; wait for a hydrated input response
  // in scenarios below rather than interpreting only server-rendered markup.
  await sleep(200);
}
async function press(key, modifiers = 0) {
  const codes = { ArrowLeft: 37, ArrowRight: 39, Tab: 9, Enter: 13, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, ' ': 32 };
  const params = { key, code: key === ' ' ? 'Space' : key, modifiers, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function focus(selector) {
  assert.ok(await evaluate(`(() => {const e=document.querySelector(${text(selector)});e?.focus();return !!e&&document.activeElement===e;})()`), `focus ${selector}`);
}
async function click(selector) {
  const rect = await evaluate(`(() => {const e=document.querySelector(${text(selector)});if(!e||e.matches(':disabled'))return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()`);
  assert.ok(rect?.width > 0 && rect?.height > 0, `visible enabled click target ${selector}`);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}
const exprButton = label => `([...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&!e.matches(':disabled')&&(e.getAttribute('aria-label')===${text(label)}||e.textContent.trim()===${text(label)})))`;
async function button(label) {
  assert.ok(await evaluate(`(() => {const e=${exprButton(label)};e?.focus();return !!e&&document.activeElement===e;})()`), `enabled button ${label}`);
  await press('Enter');
}
async function fill(selector, value) {
  await click(selector);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, commands: ['selectAll'] });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  if (value) await call('Input.insertText', { text: value });
  else {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  }
  await wait(`document.querySelector(${text(selector)})?.value===${text(value)}`, `typed value ${selector}`);
}
async function select(selector, value) {
  assert.ok(await evaluate(`(() => {const e=document.querySelector(${text(selector)});if(!e||![...e.options].some(o=>o.value===${text(value)}))return false;const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(e,${text(value)});e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`), `native option ${selector}=${value}`);
  await wait(`document.querySelector(${text(selector)})?.value===${text(value)}`);
}
async function setInput(selector, value) {
  // An explicit crafted value tests custom validation beyond native maxLength;
  // it does not replace the normal trusted typing paths used elsewhere.
  await evaluate(`(() => {const e=document.querySelector(${text(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${text(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`document.querySelector(${text(selector)})?.value===${text(value)}`);
}
async function submit() { await button('Simular aporte'); }
async function expectNoSuccess() { assert.equal(await evaluate(`!!(${successExpression})`), false, 'No false successful contribution'); }
async function errorSummary() {
  await wait(`document.activeElement===document.querySelector(${text(errors)})`, 'focused error summary');
  const links = await evaluate(`[...document.querySelectorAll(${text(`${errors} a`)})].map(a=>({href:a.getAttribute('href'),exists:!!document.getElementById(a.hash.slice(1)),text:a.textContent}))`);
  assert.ok(links.length>0 && links.every(link=>link.exists), `Every error link targets an existing control: ${JSON.stringify(links)}`);
  for (const link of links) {
    await click(`${errors} a[href="${link.href}"]`);
    assert.equal(await evaluate('document.activeElement?.id'), link.href.slice(1), `error link focuses ${link.href}`);
  }
  const associations=await evaluate(`[...document.querySelectorAll('main [aria-invalid="true"]')].map(e=>({id:e.id,described:e.getAttribute('aria-describedby'),associated:(e.getAttribute('aria-describedby')||'').split(/\\s+/).filter(Boolean).every(id=>!!document.getElementById(id))}))`);
  assert.ok(associations.length>0&&associations.every(row=>row.described&&row.associated),'Invalid fields have existing associated errors');
  await expectNoSuccess();
}
async function theme(dark) {
  if(await evaluate(`document.documentElement.classList.contains('dark')`)!==dark)await button('Tema oscuro');
  await wait(`document.documentElement.classList.contains('dark')===${dark} && document.querySelector('button[aria-label="Tema oscuro"]')?.getAttribute('aria-pressed')==='${dark}'`);
}
async function metadata({ category = 'certamen', number = '2', year = '2024', term = '2' } = {}) {
  await select('#contribution-category', category);
  await fill('#contribution-documentNumber', number);
  await fill('#contribution-academicYear', year);
  await select('#contribution-academicTerm', term);
}
async function fixture(filename) {
  const absolute = resolve(root, 'public/demo', filename);
  await access(absolute, constants.R_OK);
  const { root: document } = await call('DOM.getDocument');
  const { nodeId } = await call('DOM.querySelector', { nodeId: document.nodeId, selector: fileInput });
  assert.ok(nodeId, 'real local file input');
  pendingFixtureURLCount = fileURLs().length;
  await call('DOM.setFileInputFiles', { nodeId, files: [absolute] });
}

async function selectedFixtureReady() {
  if (pendingFixtureURLCount === null) return;
  const previous = pendingFixtureURLCount;
  const deadline = Date.now() + 15000;
  while (fileURLs().length <= previous && Date.now() < deadline) await sleep(30);
  assert.ok(fileURLs().length > previous, 'A new selection allocated its own real preview URL');
  pendingFixtureURLCount = null;
}
async function syntheticFile({ name, type, bytes = 100, content, drop = false, multiple = false }) {
  await evaluate(`(() => {
    const input=document.querySelector(${text(fileInput)}),dt=new DataTransfer();
    const bytes=${content === undefined ? `new Uint8Array(${bytes})` : text(content)};
    dt.items.add(new File([bytes],${text(name)},{type:${text(type)}}));
    ${multiple ? `dt.items.add(new File(['extra'],'extra.pdf',{type:'application/pdf'}));` : ''}
    ${drop ? `input.parentElement.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));` : `input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`}
  })()`);
}
async function pdfReady(page = 1) {
  await selectedFixtureReady();
  await wait(`document.querySelector(${text(pageOutput)})?.textContent===${text(`Página ${page} de 3`)} && document.querySelector(${text(`${reader} canvas`)})?.width>0 && !!document.querySelector(${text(`${reader} .textLayer span`)}) && !document.querySelector(${text(`${reader} [aria-busy="true"]`)})`, `real local PDF page ${page}`, 25000);
  assert.equal(await evaluate(`document.querySelectorAll(${text(`${reader} canvas`)}).length`), 1);
  assert.equal(await evaluate(`document.querySelector(${text(`${reader} .react-pdf__Page`)})?.getAttribute('data-page-number')`), String(page));
}
async function imageReady() {
  await selectedFixtureReady();
  await wait(`(() => {const r=document.querySelector(${text(reader)}),i=r?.querySelector('img');return i?.complete&&i.naturalWidth>0&&i.closest('[aria-busy]')?.getAttribute('aria-busy')==='false'&&!r.querySelector('[role="alert"],[aria-busy="true"]')&&!/Cargando imagen/.test(r.textContent);})()`, 'real decoded local image, settled loading state');
}
async function snapshot(name) {
  await evaluate('window.scrollTo(0,0)'); await sleep(100);
  const metrics = await call('Page.getLayoutMetrics');
  const width = await evaluate('innerWidth');
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(18000, Math.ceil(metrics.cssContentSize.height)), scale: 1 } });
  const filename = resolve(artifacts, `${name}.png`);
  await writeFile(filename, Buffer.from(data, 'base64')); report.screenshots.push(filename);
}
async function check(name, fn) {
  const start = Date.now();
  try { await fn(); report.checks.push({ name, pass: true, ms: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (error) {
    let state;
    try { state = await evaluate(`({url:location.href,body:document.querySelector('main')?.innerText.slice(0,6500),active:{tag:document.activeElement?.tagName,id:document.activeElement?.id},fields:[...document.querySelectorAll('main input,main select')].map(e=>({id:e.id,value:e.type==='file'?'[not read]':e.value,checked:e.checked,invalid:e.getAttribute('aria-invalid')}))})`); } catch {}
    report.checks.push({ name, pass: false, ms: Date.now() - start, error: error.message, state });
    console.error(`FAIL ${name}: ${error.message}`);
    try { await snapshot(`failure-${name.replace(/[^a-z0-9]+/gi, '-').slice(0,100)}`); } catch {}
  }
}
async function storageSnapshot() {
  return await evaluate(`(async()=>({local:{...localStorage},session:{...sessionStorage},cookies:document.cookie,databases:indexedDB.databases?await indexedDB.databases():null,caches:await caches.keys()}))()`);
}
// Hard navigations destroy the complete document and automatically release its
// blob registry; they do not promise JS cleanup callbacks. Explicit revocations
// are asserted per live document, including real client-side route teardown.
const fileURLs = () => report.objectURLs.filter(row => row.kind === 'create' && row.file && row.document === currentDocument);
const activeURLs = () => fileURLs().filter(row => !report.objectURLs.some(event => event.kind === 'revoke' && event.url === row.url));
async function noActiveURLs(description) {
  const deadline = Date.now() + 5000;
  while (activeURLs().length && Date.now() < deadline) await sleep(70);
  assert.deepEqual(activeURLs(), [], description);
}

async function pauseNextSignature() {
  // Delay one native read without replacing its bytes or validation outcome.
  await evaluate(`(() => {
    const native=Blob.prototype.arrayBuffer;
    window.__qaSignaturePending=false;
    window.__qaSignatureSettled=false;
    window.__qaReleaseSignature=null;
    Blob.prototype.arrayBuffer=function(...args){
      if(this.size!==12)return Reflect.apply(native,this,args);
      Blob.prototype.arrayBuffer=native;
      window.__qaSignaturePending=true;
      return new Promise(resolve=>{window.__qaReleaseSignature=resolve;}).then(()=>Reflect.apply(native,this,args)).finally(()=>{window.__qaSignatureSettled=true;});
    };
    window.__qaRestoreSignature=()=>{Blob.prototype.arrayBuffer=native;window.__qaReleaseSignature?.();};
  })()`);
}

async function catalogueSnapshot() {
  const response=await fetch(new URL('/',base));
  assert.equal(response.status,200);
  const cards=(await response.text()).match(/<article\b[\s\S]*?<\/article>/g)??[];
  assert.equal(cards.length,9,'The approved fixture catalogue remains unchanged');
  return cards;
}

try {
  await mkdir(artifacts, { recursive: true });
  assert.ok(process.env.WIKI_TEST_BASE_URL, 'BLOCKED: WIKI_TEST_BASE_URL must identify the coordinator\'s existing server');
  base = new URL(process.env.WIKI_TEST_BASE_URL);
  assert.ok(['http:', 'https:'].includes(base.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) && !base.username && !base.password, 'Fixture-only QA requires a loopback HTTP origin without credentials');
  report.base = base.href;
  assert.equal((await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })).status, 200, 'Existing /aportar server must be available');
  const cache = resolve(homedir(), '.cache/ms-playwright');
  const versions = (await readdir(cache).catch(() => [])).filter(name => /^chromium-\d+$/.test(name)).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  const candidates = [process.env.WIKI_CHROME_PATH, ...versions.flatMap(name => [resolve(cache,name,'chrome-linux64/chrome'),resolve(cache,name,'chrome-linux/chrome')]), '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
  for (const candidate of candidates) { try { await access(candidate, constants.X_OK); executable = candidate; break; } catch {} }
  assert.ok(executable, 'No executable Chrome found. Set WIKI_CHROME_PATH; no browser is installed by this runner');
  report.executable = executable;
  // Linux limita la ruta del socket Unix de Chromium; mantener el perfil corto.
  profile = await mkdtemp(resolve(root, '.next/qac-'));
  const wsURL = await launch(); // One sandboxed attempt only; failures are BLOCKED below.
  socket = new WebSocket(wsURL);
  await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true}); });
  rpc = connection(socket);
  report.browserVersion = await rpc.send('Browser.getVersion');
  const { targetId } = await rpc.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await rpc.send('Target.attachToTarget', { targetId, flatten: true }));
  rpc.on('Runtime.exceptionThrown', (event,sid) => { if (sid===session) (injecting?report.expectedErrors:report.browserErrors).push({type:'exception',...event.exceptionDetails}); });
  rpc.on('Runtime.consoleAPICalled', (event,sid) => {
    if(sid!==session)return;
    const row={type:event.type,text:event.args.map(arg=>arg.value??arg.description??'').join(' ')};
    if(event.type==='error')(injecting?report.expectedErrors:report.browserErrors).push(row);
    if(event.type==='warning')report.warnings.push({...row,injected:injecting});
  });
  rpc.on('Log.entryAdded', (event,sid) => { if(sid===session&&event.entry.level==='error')(injecting?report.expectedErrors:report.browserErrors).push({type:'log',...event.entry}); });
  rpc.on('Network.requestWillBeSent', (event,sid) => { if(sid===session)report.requests.push({id:event.requestId,url:event.request.url,method:event.request.method,type:event.type,injected:injecting}); });
  rpc.on('Network.responseReceived', (event,sid) => { if(sid===session)report.responses.push({url:event.response.url,status:event.response.status,mimeType:event.response.mimeType,injected:injecting}); });
  rpc.on('Network.loadingFailed', (event,sid) => { if(sid===session&&!event.canceled&&event.errorText!=='net::ERR_ABORTED')(injecting?report.expectedErrors:report.networkFailures).push(event); });
  rpc.on('Runtime.bindingCalled', (event,sid) => {
    if(sid!==session||event.name!=='__qaContributionEvent')return;
    const row=JSON.parse(event.payload);
    if(row.type==='url')report.objectURLs.push(row);
    if(row.type==='persistence')report.persistenceCalls.push(row);
  });
  rpc.on('Fetch.requestPaused', (event,sid) => {
    if(sid!==session)return;
    void (async()=>{
      try {
        const url=new URL(event.request.url);
        const safe=['GET','HEAD','OPTIONS'].includes(event.request.method) && (!['http:','https:'].includes(url.protocol)||url.origin===base.origin);
        if(safe&&holdScripts&&event.resourceType==='Script')heldScripts.push(event.requestId);
        else if(safe)await call('Fetch.continueRequest',{requestId:event.requestId});
        else {
          report.preventedRequests.push({url:event.request.url,method:event.request.method});
          await call('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});
        }
      } catch(error){
        // A document navigation can cancel an already-paused request before CDP
        // continues it. This transport cancellation is not an application fault.
        if (/Invalid InterceptionId/.test(error.message)) report.warnings.push({ type: 'cdp-cancelled-request', text: error.message });
        else interceptionError=error.message;
      }
    })();
  });
  for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await call(method);
  await call('Network.setCacheDisabled',{cacheDisabled:true});
  await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await call('Runtime.addBinding',{name:'__qaContributionEvent'});
  // Observe native implementations, preserving their actual return values,
  // exceptions and behavior. Telemetry goes to CDP, never browser persistence.
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const document=crypto.randomUUID();window.__qaContributionDocument=document;
    const emit=row=>window.__qaContributionEvent(JSON.stringify({...row,page:location.href,document}));
    const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
    URL.createObjectURL=function(blob){const url=Reflect.apply(create,this,[blob]);emit({type:'url',kind:'create',url,file:blob instanceof File,name:blob instanceof File?blob.name:null,mime:blob.type,bytes:blob.size});return url;};
    URL.revokeObjectURL=function(url){const result=Reflect.apply(revoke,this,[url]);emit({type:'url',kind:'revoke',url:String(url)});return result;};
    for(const method of ['setItem','removeItem','clear']){const native=Storage.prototype[method];Storage.prototype[method]=function(...args){const result=Reflect.apply(native,this,args);emit({type:'persistence',kind:this===localStorage?'localStorage':'sessionStorage',method,key:String(args[0]??'')});return result;};}
    for(const [owner,kind,method] of [[IDBFactory.prototype,'indexedDB','open'],[IDBFactory.prototype,'indexedDB','deleteDatabase'],[CacheStorage.prototype,'cacheStorage','open'],[CacheStorage.prototype,'cacheStorage','delete'],[Cache.prototype,'cache','put'],[Cache.prototype,'cache','add'],[Cache.prototype,'cache','addAll']]){const native=owner[method];owner[method]=function(...args){const result=Reflect.apply(native,this,args);emit({type:'persistence',kind,method});return result;};}
  })()`});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}]});
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});

  await check('Course keyboard search by name/code, native radio arrows and no results', async()=>{
    await navigate('/aportar');
    const initialCourseCount = await evaluate(`document.querySelectorAll('input[name="courseId"]').length`);
    assert.equal(await evaluate(`document.querySelectorAll('input[name="courseId"]:checked').length`),0);
    await fill('#contribution-course-search','calculo');
    await wait(`document.querySelectorAll('input[name="courseId"]').length===1`,'accent-insensitive course filtering');
    await press('Tab');
    assert.equal(await evaluate(`document.activeElement?.name`),'courseId');
    await press(' ');
    await wait(`document.querySelector(${text(courseRadio)})?.checked`,'keyboard selected Cálculo I');
    await fill('#contribution-course-search','DEMO-C1');
    await wait(`document.querySelectorAll('input[name="courseId"]').length===1 && !!document.querySelector(${text(courseRadio)})`,'code search');
    await fill('#contribution-course-search','sin-coincidencias-qa');
    await wait(`document.querySelectorAll('input[name="courseId"]').length===0 && document.querySelector('main').textContent.includes('No encontramos ramos')`);
    assert.ok(await evaluate(`[...document.querySelectorAll('main [role="status"]')].some(e=>e.textContent.includes('Ramo seleccionado')&&e.textContent.includes('Cálculo I'))`),'Selected course remains visible outside filtered results');
    await metadata({category:'apunte',number:''});
    assert.equal(await evaluate(`document.querySelector('#contribution-section-4').closest('section').querySelector('dd').textContent`),'Cálculo I','Hidden selected radio does not erase draft selection');
    await snapshot('course-no-results');
    await button('Limpiar búsqueda');
    await wait(`document.querySelectorAll('input[name="courseId"]').length===${initialCourseCount}`);
    await focus(courseRadio); await press('ArrowRight');
    await wait(`document.querySelector('input[name="courseId"]:checked')?.value==='demo-algebra-i'`,'native radio arrow selection');
    await press('ArrowLeft');
    await wait(`document.querySelector(${text(courseRadio)})?.checked`);
    assert.match(await evaluate(`document.querySelector('main').innerText`),/Semestre curricular 1/);
  });

  await check('Empty form: focused linked errors, authorization unchecked, no invented submission',async()=>{
    await navigate('/aportar');
    assert.equal(await evaluate(`document.querySelector('#contribution-authorization').checked`),false);
    await submit(); await errorSummary();
    for(const id of ['courseId','category','academicYear','academicTerm','file','authorization']){
      assert.ok(await evaluate(`!!document.querySelector(${text(`${errors} a[href="#contribution-${id}"]`)})`),`error for ${id}`);
    }
    await snapshot('empty-errors');
  });

  await check('Categories require number only for Listado/Certamen; clear and optional transitions',async()=>{
    await navigate();
    for(const category of ['listado','certamen']){
      await metadata({category,number:''});
      assert.equal(await evaluate(`document.querySelector('#contribution-documentNumber').required`),true);
      await submit(); await errorSummary();
      assert.ok(await evaluate(`!!document.querySelector('#contribution-documentNumber-error')`));
    }
    await metadata({category:'apunte',number:''});
    assert.equal(await evaluate(`document.querySelector('#contribution-documentNumber').required`),false);
    await submit(); await errorSummary();
    assert.equal(await evaluate(`!!document.querySelector('#contribution-documentNumber-error')`),false);
    assert.equal(await evaluate(`document.querySelector('#contribution-section-4').closest('section').querySelector('h3').textContent`),'Apuntes - 2024-2');
    await fill('#contribution-documentNumber','9');
    await wait(`document.querySelector('#contribution-section-4').closest('section').querySelector('h3').textContent==='Apuntes 9 - 2024-2'`);
    await select('#contribution-category','');
    await submit(); await errorSummary();
    assert.ok(await evaluate(`!!document.querySelector('#contribution-category-error')`));
    await select('#contribution-category','listado');
    assert.equal(await evaluate(`document.querySelector('#contribution-documentNumber').required`),true);
    assert.equal(await evaluate(`document.querySelector('#contribution-documentNumber').value`),'9','Category changes preserve typed number');
  });

  await check('Academic period independent of curriculum; normalized name ignores secondary/original title',async()=>{
    await navigate(); await metadata();
    await fill('#contribution-title','Listado 77 - 2099-1');
    await fill('#contribution-section','Sección QA');
    await fill('#contribution-instructor','Docente de demostración');
    await fill('#contribution-version','Versión alternativa');
    const summary=await evaluate(`(() => {const s=document.querySelector('#contribution-section-4').closest('section');return {name:s.querySelector('h3').textContent,details:Object.fromEntries([...s.querySelectorAll('dl > div')].map(e=>[e.querySelector('dt').textContent,e.querySelector('dd').textContent]))};})()`);
    assert.equal(summary.name,'Certamen 2 - 2024-2');
    assert.equal(summary.details['Período académico'],'2024-2');
    assert.equal(summary.details['Profesor o profesora'],'Docente de demostración');
    assert.match(await evaluate(`document.querySelector('#contribution-section-1').closest('section').innerText`),/Semestre curricular 1/);
    assert.equal(await evaluate(`document.querySelectorAll('main input[name="curricularSemester"],main select[name="curricularSemester"]').length`),0);
    for(const [selector,value,errorId] of [['#contribution-academicYear','1899','academicYear'],['#contribution-academicYear','2024abc','academicYear'],['#contribution-documentNumber','0','documentNumber'],['#contribution-documentNumber','2.5','documentNumber']]){
      await fill(selector,value);await submit();await errorSummary();
      assert.ok(await evaluate(`!!document.querySelector(${text(`#contribution-${errorId}-error`)})`));
      await metadata();
    }
    await select('#contribution-academicTerm','');await submit();await errorSummary();
    assert.ok(await evaluate(`!!document.querySelector('#contribution-academicTerm-error')`));
  });

  await check('Instructor 120/121: native maxlength and crafted overlong value retain field error',async()=>{
    await navigate();await metadata();
    const name='P'.repeat(120);
    assert.equal(await evaluate(`document.querySelector('#contribution-instructor').maxLength`),120);
    await fill('#contribution-instructor',name);
    await call('Input.insertText',{text:'X'});
    assert.equal(await evaluate(`document.querySelector('#contribution-instructor').value`),name,'Native input rejects character 121');
    await submit();await errorSummary();
    assert.equal(await evaluate(`!!document.querySelector('#contribution-instructor-error')`),false,'120 characters are valid');
    await setInput('#contribution-instructor',name+'X');await submit();await errorSummary();
    assert.match(await evaluate(`document.querySelector('#contribution-instructor-error')?.textContent`),/120/);
    assert.equal(await evaluate(`document.querySelector('#contribution-instructor').value.length`),121,'Error does not discard value');
    await fill('#contribution-instructor',name);await submit();await errorSummary();
    assert.equal(await evaluate(`!!document.querySelector('#contribution-instructor-error')`),false);
  });

  await check('Loading PDF cannot succeed; real PDF renders ink, paginates 1/2/3 and owns separate search form',async()=>{
    await navigate();await metadata();await click('#contribution-authorization');
    const storage=await storageSnapshot(),persistenceStart=report.persistenceCalls.length;
    holdScripts=true;
    try{
      await fixture('calculo-certamen-demo.pdf');
      await wait(`document.querySelector('#contribution-preview')?.textContent.includes('Preparando lector PDF')`,'real lazy PDF reader is loading');
      assert.ok(heldScripts.length>0,'Actual lazy reader network request is paused before delivery');
      await submit();await errorSummary();
      assert.match(await evaluate(`document.querySelector('#contribution-file-error')?.textContent`),/espera|cargar|previsualización/i);
      await snapshot('pdf-loading-cannot-confirm');
    }finally{
      holdScripts=false;
      for(const requestId of heldScripts.splice(0))await call('Fetch.continueRequest',{requestId});
    }
    await pdfReady();
    const pixels=await evaluate(`(() => {const c=document.querySelector(${text(`${reader} canvas`)}),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&(d[i]<220||d[i+1]<220||d[i+2]<220))ink++;return {ink,width:c.width,height:c.height};})()`);
    assert.ok(pixels.ink>100,`PDF is not a placeholder canvas: ${JSON.stringify(pixels)}`);
    assert.equal(await evaluate(`document.querySelector('button[aria-label="Página anterior"]').disabled`),true);
    for(const page of [2,3]){await button('Página siguiente');await pdfReady(page);}
    assert.equal(await evaluate(`document.querySelector('button[aria-label="Página siguiente"]').disabled`),true);
    for(const page of [2,1]){await button('Página anterior');await pdfReady(page);}
    assert.ok(await evaluate(`(() => {const f=document.querySelector('form[aria-label="Buscar texto en todo el PDF"]');return !!f&&f.id!=='contribution-form'&&!f.parentElement.closest('form')&&f.querySelector('input').form===f;})()`),'PDF search owns an independent, nonnested form');
    await fill('form[aria-label="Buscar texto en todo el PDF"] input','continuidad');await press('Enter');
    await wait(`!!document.querySelector('mark[data-reader-match]')`,'real PDF text search');
    await expectNoSuccess();
    assert.deepEqual(await storageSnapshot(),storage);
    assert.deepEqual(report.persistenceCalls.slice(persistenceStart),[],'Metadata/preview/search do not persist');
    await snapshot('local-pdf-ready');
  });

  for(const [filename,mime,extension] of [['calculo-funciones-demo.jpg','image/jpeg','jpg'],['calculo-listado-demo.png','image/png','png'],['calculo-apuntes-demo.webp','image/webp','webp']]){
    await check(`Local ${mime} via DOM.setFileInputFiles decodes, zoom changes real geometry`,async()=>{
      await navigate();await metadata();await fixture(filename);await imageReady();
      const image=await evaluate(`(() => {const i=document.querySelector(${text(`${reader} img`)});return {src:i.currentSrc,alt:i.alt,width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,filter:getComputedStyle(i).filter};})()`);
      assert.match(image.src,/^blob:/);assert.equal(image.alt,`Certamen 2 - 2024-2.${extension}`);
      assert.ok(Math.abs(image.width/image.height-image.naturalWidth/image.naturalHeight)<0.01);
      assert.equal(fileURLs().at(-1).mime,mime);
      assert.ok(!image.alt.includes(filename),'Original filename does not determine public name');
      await button('Aumentar zoom');
      await wait(`document.querySelector('output[aria-label="Zoom"]')?.textContent==='125%'`);
      const zoomed=await evaluate(`document.querySelector(${text(`${reader} img`)}).getBoundingClientRect().width`);
      assert.ok(zoomed>image.width*1.2,'Zoom resizes the decoded document, not only the label');
      await button('Restablecer zoom y posición');
      await wait(`document.querySelector('output[aria-label="Zoom"]')?.textContent==='100%'`);
      assert.equal(await evaluate(`document.querySelectorAll('main a[download],main a[href*="/archivo"]').length`),0,'No public or upload URL for selected local file');
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
      await snapshot(`local-${extension}-ready`);
    });
  }

  await check('Invalid replacement MIME/SVG/empty/size/signature/multiple retains valid image and metadata',async()=>{
    await navigate();await metadata();await fixture('calculo-listado-demo.png');await imageReady();
    const before=await evaluate(`document.querySelector(${text(`${reader} img`)}).currentSrc`);
    const cases=[
      {name:'incorrect.pdf',type:'text/plain',content:'%PDF-1.7\nnot a PDF'},
       {name:'vector.svg',type:'image/svg+xml',content:'<svg xmlns="http://www.w3.org/2000/svg"><script>throw new Error("SVG MUST NOT RUN")</script></svg>'},
       {name:'page.html',type:'text/html',content:'<html><script>throw new Error("HTML MUST NOT RUN")</script></html>'},
       {name:'program.exe',type:'application/x-executable',content:'not executable content'},
      {name:'unknown.pdf',type:'application/octet-stream'},
      {name:'empty.pdf',type:'application/pdf',bytes:0},
      {name:'large.pdf',type:'application/pdf',bytes:25*1024*1024+1},
      {name:'mismatch.png',type:'application/pdf',content:'%PDF-1.7\n'},
      {name:'bad-signature.pdf',type:'application/pdf',content:'not a PDF file'},
      {name:'first.pdf',type:'application/pdf',content:'%PDF-1.7\n',drop:true,multiple:true},
    ];
    for(const candidate of cases){
      const created=fileURLs().length;
      await syntheticFile(candidate);
      await wait(`!!document.querySelector('#contribution-file-error')?.textContent && ![...document.querySelectorAll('main [role="status"]')].some(e=>/Comprobando el archivo/.test(e.textContent))`,`validation ${candidate.name}`);
      assert.equal(await evaluate(`document.querySelector(${text(`${reader} img`)})?.currentSrc`),before,`${candidate.name}: previous image retained`);
      assert.equal(fileURLs().length,created,'Invalid selection does not allocate another preview URL');
      assert.equal(await evaluate(`document.querySelector('#contribution-academicYear').value`),'2024');
      assert.equal(await evaluate(`document.querySelector('#contribution-documentNumber').value`),'2');
      await submit();await errorSummary();
      assert.ok(await evaluate(`!!document.querySelector(${text(`${errors} a[href="#contribution-file"]`)})`));
    }
    await snapshot('invalid-file-preserves-valid-selection');
    await fixture('calculo-funciones-demo.jpg');await imageReady();
    assert.equal(await evaluate(`!!document.querySelector('#contribution-file-error')`),false,'Valid replacement recovers');
  });

  for(const candidate of [
    {name:'corrupt-with-pdf-signature.pdf',type:'application/pdf',content:'%PDF-1.7\nThis has a valid prefix but no actual PDF objects.'},
    {name:'corrupt-with-png-signature.png',type:'image/png',content:'\u0089PNG\r\n\u001a\nnot a decoded image',png:true},
  ]){
    await check(`Corrupt ${candidate.type} with valid signature: reader error, no confirmation, replacement recovery`,async()=>{
      await navigate();await metadata();await click('#contribution-authorization');
      injecting=true;
      try{
        if(candidate.png){
          await evaluate(`(() => {const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,99])],${text(candidate.name)},{type:'image/png'}));const i=document.querySelector(${text(fileInput)});i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        }else await syntheticFile(candidate);
        await wait(`!!document.querySelector(${text('#contribution-preview [role="alert"]')})`,'Real decoder rejects corrupt bytes despite accepted signature',25000);
        assert.ok(fileURLs().some(row=>row.name===candidate.name),'File passed selection signature and reached real reader');
        await submit();await errorSummary();
        assert.match(await evaluate(`document.querySelector('#contribution-file-error')?.textContent`),/leer|previsualizar/i);
        await snapshot(`corrupt-${candidate.png?'png':'pdf'}-cannot-confirm`);
        await fixture('calculo-listado-demo.png');await imageReady();
        assert.equal(await evaluate(`!!document.querySelector('#contribution-preview [role="alert"]')`),false);
        await expectNoSuccess();
      }finally{await sleep(150);injecting=false;}
    });
  }

  await check('Partial PDF render failure remains latched after another real page succeeds; new selection resets',async()=>{
    await navigate();await metadata();await click('#contribution-authorization');
    await fixture('calculo-certamen-demo.pdf');await pdfReady();
    injecting=true;
    try{
      // Inject a real canvas rendering exception on page 2 only. No reader
      // status/callback or successful output is mocked; pages 1 and 3 use the
      // native PDF.js rendering pipeline and real local document throughout.
      await evaluate(`(() => {
        const native=CanvasRenderingContext2D.prototype.fillRect;
        window.__qaCanvasFaults=0;
        window.__qaRestoreCanvas=()=>{CanvasRenderingContext2D.prototype.fillRect=native;delete window.__qaRestoreCanvas;};
        CanvasRenderingContext2D.prototype.fillRect=function(...args){
          if(this.canvas.closest('.react-pdf__Page[data-page-number="2"]')){window.__qaCanvasFaults++;throw new Error('QA intentional page-2 canvas render failure');}
          return Reflect.apply(native,this,args);
        };
      })()`);
      await button('Página siguiente');
      await wait(`window.__qaCanvasFaults>0 && !!document.querySelector(${text(`${reader} [role="alert"]`)})`,'Actual page 2 rendering failure is reported',25000);
      report.partialPDFError={faults:await evaluate('window.__qaCanvasFaults'),failedPage:2};
      await evaluate('window.__qaRestoreCanvas?.()');
      await submit();await errorSummary();
      await button('Página siguiente');await pdfReady(3);
      assert.equal(await evaluate(`!!document.querySelector(${text(`${reader} [role="alert"]`)})`),false,'Page 3 renders successfully after page 2 failure');
      await submit();await errorSummary();
      assert.match(await evaluate(`document.querySelector('#contribution-file-error')?.textContent`),/error de lectura|leer/i,'Successful page 3 must not clear known file failure');
      await snapshot('partial-pdf-error-latched-after-page-3');
      await button('Cerrar previsualización');await noActiveURLs('Closing the failed file revokes its URL');
      await button('Abrir previsualización');await pdfReady();
      await submit();await errorSummary();
      assert.match(await evaluate(`document.querySelector('#contribution-file-error')?.textContent`),/error de lectura|leer/i,'Reopening is not a new file selection');
      await fixture('calculo-certamen-demo.pdf');await pdfReady();
      await submit();
      await wait(`!!(${successExpression})`,'Only a fresh selection resets the failure latch');
      report.partialPDFError.recoveredByNewSelection=true;
      await button('Quitar archivo');await noActiveURLs('Partial-render scenario cleanup');
    }finally{
      await evaluate('window.__qaRestoreCanvas?.()');
      await sleep(150);injecting=false;
    }
  });

  await check('Native object URLs revoked on close/reopen/replace/remove and client navigation',async()=>{
    await navigate();await metadata();await fixture('calculo-listado-demo.png');await imageReady();
    const first=await evaluate(`document.querySelector(${text(`${reader} img`)}).currentSrc`);
    await button('Cerrar previsualización');
    await wait(`!document.querySelector(${text(reader)})`);await noActiveURLs('Close revokes selected file URL');
    assert.ok(await evaluate(`document.querySelector('main').innerText.includes('calculo-listado-demo.png')`),'Closing does not remove file');
    await button('Abrir previsualización');await imageReady();
    const second=await evaluate(`document.querySelector(${text(`${reader} img`)}).currentSrc`);
    assert.notEqual(second,first,'Reopen allocates a fresh native URL');
    await fixture('calculo-funciones-demo.jpg');await imageReady();
    assert.ok(report.objectURLs.some(row=>row.kind==='revoke'&&row.url===second),'Replace revokes old image URL');
    assert.equal(activeURLs().length,1);
    await button('Quitar archivo');await wait(`!document.querySelector(${text(reader)})`);await noActiveURLs('Remove revokes file URL');
    assert.equal(await evaluate(`!!(${exprButton('Quitar archivo')})`),false);
    assert.equal(await evaluate(`document.querySelector('#contribution-academicYear').value`),'2024');
    await fixture('calculo-apuntes-demo.webp');await imageReady();
    await click('main a[href="/"]');
    await wait(`location.pathname==='/' && !!document.querySelector('main h1')`,'client-side route exit');
    await noActiveURLs('Next Activity cleanup on navigation revokes all local File URLs');
    report.urlLifecycle={nativeDelegated:true,created:fileURLs().length,revoked:fileURLs().filter(row=>report.objectURLs.some(event=>event.kind==='revoke'&&event.url===row.url)).length};
  });

  await check('Native signature read races: A→B and remove during pending replacement',async()=>{
    await navigate();await metadata();
    try{
      await pauseNextSignature();
      await fixture('calculo-funciones-demo.jpg');
      await wait('window.__qaSignaturePending','First file signature is pending');
      await fixture('calculo-apuntes-demo.webp');await imageReady();
      const current=await evaluate(`document.querySelector(${text(`${reader} img`)}).currentSrc`);
      await evaluate('window.__qaReleaseSignature()');
      await wait('window.__qaSignatureSettled','Obsolete signature read actually settled');
      await wait(`![...document.querySelectorAll('main [role="status"]')].some(e=>/Comprobando el archivo/.test(e.textContent))`);
      assert.equal(await evaluate(`document.querySelector(${text(`${reader} img`)}).currentSrc`),current,'Stale A never replaces B');
      assert.ok(!fileURLs().some(row=>row.name==='calculo-funciones-demo.jpg'),'No URL allocated for obsolete A');
      await pauseNextSignature();
      await fixture('calculo-listado-demo.png');
      await wait('window.__qaSignaturePending','Replacement signature is pending');
      await button('Quitar archivo');await noActiveURLs('Removing during validation releases B');
      await evaluate('window.__qaReleaseSignature()');
      await wait('window.__qaSignatureSettled','Cancelled signature read actually settled');
      assert.equal(await evaluate(`!!document.querySelector(${text(reader)})`),false,'Cancelled replacement cannot restore a preview');
      assert.equal(await evaluate(`!!(${exprButton('Quitar archivo')})`),false,'Cancelled replacement cannot restore a selection');
      assert.equal(await evaluate(`document.querySelector('#contribution-academicYear').value`),'2024');
    }finally{await evaluate('window.__qaRestoreSignature?.()');}
  });

  await check('Permission required; exact simulation confirmation, no POST/persistence; reload clears memory',async()=>{
    await navigate();await metadata();
    const publicBefore=await catalogueSnapshot();
    const storage=await storageSnapshot(),persistenceStart=report.persistenceCalls.length,networkStart=report.requests.length;
    await fixture('calculo-listado-demo.png');await imageReady();
    await submit();await errorSummary();
    assert.ok(await evaluate(`!!document.querySelector('#contribution-authorization-error')`));
    await focus('#contribution-authorization');await press(' ');
    assert.equal(await evaluate(`document.querySelector('#contribution-authorization').checked`),true);
    await submit();
    await wait(`!!(${successExpression}) && document.activeElement===(${successExpression})`,'Exact focused simulation confirmation');
    assert.equal(await evaluate(`(${successExpression}).textContent`),confirmation);
    assert.equal(await evaluate(`!!document.querySelector(${text(errors)})`),false);
    assert.deepEqual(await storageSnapshot(),storage,'No local/session storage, cookies, databases or CacheStorage changes');
    assert.deepEqual(report.persistenceCalls.slice(persistenceStart),[],'Native persistent write APIs not called');
    assert.deepEqual(report.requests.slice(networkStart).filter(row=>!['GET','HEAD','OPTIONS'].includes(row.method)),[],'No mutating requests attempted');
    assert.deepEqual(report.preventedRequests,[],'No attempted POST/upload or external requests needed blocking');
    assert.deepEqual(await catalogueSnapshot(),publicBefore,'Simulating never inserts the local file into the public catalogue');
    await snapshot('exact-local-confirmation');
    await fill('#contribution-title','Cambio después de confirmar');await expectNoSuccess();
    await navigate();
    assert.equal(await evaluate(`document.querySelector('#contribution-category').value`),'');
    assert.equal(await evaluate(`document.querySelector('#contribution-academicYear').value`),'');
    assert.equal(await evaluate(`document.querySelector('#contribution-title').value`),'');
    assert.equal(await evaluate(`document.querySelector('#contribution-instructor').value`),'');
    assert.equal(await evaluate(`document.querySelector('#contribution-authorization').checked`),false);
    assert.equal(await evaluate(`!!document.querySelector(${text(reader)})`),false);await expectNoSuccess();
  });

  for(const width of [375,768,1280,1440])for(const dark of [false,true]){
    await check(`Responsive ${width}px ${dark?'dark':'light'}: form/preview, labels, controls and opaque contrast`,async()=>{
      await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await navigate();await theme(dark);await metadata({category:'apunte',number:''});
      await fill('#contribution-title','Título descriptivo largo de demostración para comprobar el ajuste del texto en pantallas estrechas y la revisión de metadatos secundarios.');
      await fill('#contribution-instructor','P'.repeat(120));
      await fill('#contribution-section','S'.repeat(80));
      await fill('#contribution-version','V'.repeat(80));
      await fixture('calculo-listado-demo.png');await imageReady();
      const layout=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,headings:[...document.querySelectorAll('main h1,main h2,main h3')].map(e=>({text:e.textContent,client:e.clientWidth,scroll:e.scrollWidth})),controls:[...document.querySelectorAll('main button,main select,main input:not([type="radio"]):not([type="checkbox"])')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,label:e.getAttribute('aria-label')||e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),smallInputs:[...document.querySelectorAll('main input[type="radio"],main input[type="checkbox"]')].map(e=>{const r=e.closest('label').getBoundingClientRect();return {id:e.id,width:r.width,height:r.height};}),labels:[...document.querySelectorAll('main input,main select')].filter(e=>e.type!=='radio').map(e=>({id:e.id,labeled:e.labels?.length>0})),imageFilter:getComputedStyle(document.querySelector(${text(`${reader} img`)})).filter})`);
      report.responsive.push({dark,...layout});
      await snapshot(`contributions-${width}-${dark?'dark':'light'}`);
      assert.ok(layout.scroll<=width&&layout.body<=width,`No horizontal page overflow: ${JSON.stringify(layout)}`);
      assert.ok(layout.headings.every(row=>row.scroll<=row.client),'No heading clipping');
      assert.ok(layout.controls.every(row=>row.width>=44&&row.height>=44),'Visible form/reader controls meet 44px');
      assert.ok(layout.smallInputs.every(row=>row.width>=44&&row.height>=44),'Radio/checkbox labels provide adequate hit areas');
      assert.ok(layout.labels.every(row=>row.labeled),'Visible inputs/selects have associated labels');
      assert.equal(layout.imageFilter,'none','Document colors remain original in both themes');
      const contrast=await evaluate(`(() => {
        const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number),lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),out=[];
        for(const e of document.querySelectorAll('main h1,main h2,main h3,main p,main dt,main dd,main label,main a,main button,main output')){
          const r=e.getBoundingClientRect();if(r.width<2||r.height<2||e.closest('.textLayer')||e.closest('[disabled]'))continue;
          const s=getComputedStyle(e);let bg=rgb(s.backgroundColor),p=e.parentElement;
          while((bg[3]??1)===0&&p){bg=rgb(getComputedStyle(p).backgroundColor);p=p.parentElement;}
          const fg=rgb(s.color);if(fg.length<3||bg.length<3||(bg[3]??1)<1||(fg[3]??1)<1)continue;
          const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
          out.push({tag:e.tagName,text:e.textContent.trim().slice(0,80),ratio,required:large?3:4.5});
        }return out;
      })()`);
      const failures=contrast.filter(row=>row.ratio<row.required);
      report.contrast.push({width,dark,samples:contrast.length,failures});
      assert.ok(contrast.length>=15);assert.deepEqual(failures,[],'Opaque text meets AA');
    });
  }

  await check('Keyboard Tab: visible focus through contribution and separate reader controls',async()=>{
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await navigate();await metadata();await fixture('calculo-certamen-demo.pdf');await pdfReady();
    await focus('#contribution-course-search');
    const rows=[];
    for(let i=0;i<40;i++){
      await press('Tab');
      rows.push(await evaluate(`(() => {const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,name:e.getAttribute('aria-label')||e.textContent.trim().slice(0,70),visible:r.width>0&&r.height>0,outline:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow,focusVisible:e.matches(':focus-visible')};})()`));
    }
    report.keyboard.push({type:'contribution-tab',rows});
    for(const id of ['contribution-category','contribution-documentNumber','contribution-academicYear','contribution-academicTerm','contribution-instructor','contribution-file','contribution-authorization'])assert.ok(rows.some(row=>row.id===id),`Tab reaches ${id}`);
    assert.ok(rows.some(row=>row.name==='Simular aporte'));
    assert.ok(rows.some(row=>row.name==='Documento; desplázate para leer'));
    assert.ok(rows.every(row=>row.visible),'No hidden tab stops');
    assert.ok(rows.filter(row=>row.tag!=='BODY').every(row=>row.focusVisible&&((row.outline!=='none'&&parseFloat(row.width)>0)||row.shadow!=='none')),'Visible focus on reached controls');
  });

  await check('No unexpected runtime/network errors, uploads, persistence or external document resources',async()=>{
    assert.equal(interceptionError,undefined);
    assert.deepEqual(report.browserErrors,[]);
    assert.deepEqual(report.networkFailures,[]);
    assert.deepEqual(report.preventedRequests,[],'All mutating/external requests would have been blocked and failed QA');
    assert.deepEqual(report.requests.filter(row=>!['GET','HEAD','OPTIONS'].includes(row.method)),[]);
    assert.ok(!report.warnings.filter(row=>!row.injected).some(row=>/fake worker/i.test(row.text)));
    const external=report.requests.filter(row=>/^https?:/.test(row.url)&&new URL(row.url).origin!==base.origin);
    assert.deepEqual(external,[],'Only loopback assets are read');
    await button('Quitar archivo');await noActiveURLs('Final preview cleanup');
  });
} catch(error) {
  report.status='BLOCKED';
  report.blocked={error:error.message,stack:error.stack,sandbox:/sandbox|namespace|Operation not permitted/i.test(error.message)};
  console.error(`BLOCKED ${error.stack}`);
} finally {
  if(report.status==='RUNNING')report.status=report.checks.some(row=>!row.pass)?'FAIL':'PASS';
  report.finished=new Date().toISOString();
  report.summary={status:report.status,passed:report.checks.filter(row=>row.pass).length,failed:report.checks.filter(row=>!row.pass).length,screenshots:report.screenshots.length,preventedRequests:report.preventedRequests.length};
  report.limitations.push('Fixture-only local demo: no authentication, authorization/RLS, server file validation, upload or moderation is exercised.');
  report.limitations.push('Computed contrast checks cover opaque UI text only, not file contents, compositing or a complete WCAG audit.');
  report.limitations.push('Signature race scenarios delay a native Blob read without replacing bytes; they are deterministic regression checks, not exhaustive scheduling or memory-stress tests.');
  await mkdir(artifacts,{recursive:true});
  await writeFile(resolve(artifacts,'browser-contributions-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.summary));
  console.log(`Report: ${resolve(artifacts,'browser-contributions-report.json')}`);
  if(rpc&&socket?.readyState===WebSocket.OPEN){try{await rpc.send('Browser.close');}catch{}}
  socket?.close();
  if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){
    const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');await Promise.race([exited,sleep(3000)]);
    if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');
  }
}
if(report.status!=='PASS')process.exitCode=1;
