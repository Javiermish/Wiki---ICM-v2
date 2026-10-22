/** Small dependency-free Chromium/CDP driver. Never starts or restarts an app server. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const text = JSON.stringify;
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function connection(socket) {
  let id = 0;
  const pending = new Map(), listeners = new Map();
  socket.addEventListener("message", ({ data }) => {
    const packet = JSON.parse(data);
    if (packet.id) {
      const item = pending.get(packet.id);
      if (!item) return;
      pending.delete(packet.id); clearTimeout(item.timer);
      if (packet.error) item.reject(new Error(`${item.method}: ${JSON.stringify(packet.error)}`));
      else item.resolve(packet.result);
    } else for (const listener of listeners.get(packet.method) ?? []) listener(packet.params, packet.sessionId);
  });
  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const messageId = ++id;
        const timer = setTimeout(() => { pending.delete(messageId); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(messageId, { method, timer, resolve, reject });
        socket.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(method, listener) { listeners.set(method, [...(listeners.get(method) ?? []), listener]); },
  };
}

export async function createBrowser({ base, artifacts, report }) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Only loopback fixture servers are allowed");
  await mkdir(artifacts, { recursive: true });
  const profile = resolve(artifacts, `profile-${Date.now()}-${process.pid}`);
  // Chromium's Unix-domain singleton socket must fit Linux's 108-byte path limit.
  const temporary = resolve("/tmp/opencode", `wiki-courses-${process.pid}`);
  await mkdir(temporary, { recursive: true });
  for (const directory of [profile, "home", "config", "cache", "tmp"].map((entry, index) => index ? resolve(profile, entry) : entry)) await mkdir(directory, { recursive: true });
  const cacheRoot = resolve(homedir(), ".cache/ms-playwright");
  const versions = (await readdir(cacheRoot).catch(() => [])).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const candidates = [process.env.WIKI_CHROME_PATH, ...versions.flatMap((name) => [resolve(cacheRoot, name, "chrome-linux64/chrome"), resolve(cacheRoot, name, "chrome-linux/chrome")]), "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
  let executable, chrome, socket, rpc;
  for (const path of candidates) { try { await access(path, constants.X_OK); executable = path; break; } catch {} }
  assert.ok(executable, "No existing Chrome found; set WIKI_CHROME_PATH. This runner never installs browsers.");
  Object.assign(report, { base: base.href, executable, browserTemporaryDirectory: temporary, sandbox: "enabled", browserErrors: [], consoleWarnings: [], networkFailures: [], unexpectedRequests: [], screenshots: [], checks: [], responsive: [], keyboard: [] });

  async function stopChrome() {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((done) => chrome.once("exit", done));
      chrome.kill("SIGTERM"); await Promise.race([exited, sleep(3000)]);
      if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
    }
  }
  async function launch(noSandbox = false) {
    chrome = spawn(executable, ["--headless", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-breakpad", "--disable-crash-reporter", "--password-store=basic", "--use-mock-keychain", "--window-size=1280,900", ...(noSandbox ? ["--no-sandbox"] : []), "about:blank"], { cwd: root, env: { ...process.env, HOME: resolve(profile, "home"), XDG_CONFIG_HOME: resolve(profile, "config"), XDG_CACHE_HOME: resolve(profile, "cache"), TMPDIR: temporary }, stdio: ["ignore", "ignore", "pipe"] });
    return new Promise((done, reject) => {
      let stderr = "";
      const timer = setTimeout(() => reject(new Error(`Chrome startup timeout: ${stderr}`)), 15000);
      chrome.stderr.on("data", (chunk) => { stderr += chunk; const url = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (url) { clearTimeout(timer); done(url[1]); } });
      chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
      chrome.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}: ${stderr}`)); });
    });
  }
  try {
    // One reachability check, not a server lifecycle or readiness polling loop.
    assert.equal((await fetch(base, { signal: AbortSignal.timeout(10000) })).status, 200, "Existing server unavailable");
    let url;
    try { url = await launch(); } catch (error) {
      if (!/sandbox|namespace|Operation not permitted/i.test(error.message)) throw error;
      report.sandbox = "disabled only for this ephemeral fixture browser: environment blocks sandbox/user namespaces";
      report.sandboxFailure = error.message;
      await stopChrome(); url = await launch(true);
    }
    socket = new WebSocket(url);
    await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    rpc = connection(socket);
    report.browserVersion = await rpc.send("Browser.getVersion");
  } catch (error) { socket?.close(); await stopChrome(); throw error; }

  async function createTab() {
    const { targetId } = await rpc.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await rpc.send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params = {}) => rpc.send(method, params, sessionId);
    rpc.on("Runtime.exceptionThrown", (event, sid) => { if (sid === sessionId) report.browserErrors.push({ tab: targetId, type: "exception", ...event.exceptionDetails }); });
    rpc.on("Runtime.consoleAPICalled", (event, sid) => {
      if (sid !== sessionId) return;
      const row = { tab: targetId, type: event.type, text: event.args.map((arg) => arg.value ?? arg.description ?? "").join(" "), stack: event.stackTrace };
      if (event.type === "error") report.browserErrors.push(row);
      if (["warning", "warn"].includes(event.type)) report.consoleWarnings.push(row);
    });
    rpc.on("Log.entryAdded", (event, sid) => { if (sid === sessionId && event.entry.level === "error") report.browserErrors.push({ tab: targetId, type: "log", ...event.entry }); });
    rpc.on("Network.loadingFailed", (event, sid) => { if (sid === sessionId && !event.canceled && event.errorText !== "net::ERR_ABORTED") report.networkFailures.push({ tab: targetId, ...event }); });
    rpc.on("Network.requestWillBeSent", (event, sid) => {
      if (sid !== sessionId) return;
      const { url, method } = event.request;
      if ((/^https?:/.test(url) && new URL(url).origin !== base.origin) || !["GET", "HEAD"].includes(method)) report.unexpectedRequests.push({ tab: targetId, url, method });
    });
    for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) await call(method);
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
    async function evaluate(expression) {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function wait(expression, description = expression, timeout = 15000) {
      const started = Date.now(); let last;
      while (Date.now() - started < timeout) {
        try { last = await evaluate(expression); if (last) return last; } catch (error) { last = error.message; }
        await sleep(70);
      }
      throw new Error(`Wait failed: ${description}; last=${JSON.stringify(last)}`);
    }
    async function navigate(path) {
      const target = new URL(path, base);
      const { errorText } = await call("Page.navigate", { url: target.href });
      assert.ok(!errorText, errorText);
      await wait(`location.pathname===${text(target.pathname)} && location.search===${text(target.search)} && document.readyState==='complete' && [...document.querySelectorAll('main')].some(e=>e.getClientRects().length&&e.getAttribute('aria-busy')!=='true'&&e.querySelector('h1,h2,h3'))`, `page ready ${path}`);
      await evaluate("document.fonts.ready.then(()=>true)");
    }
    async function focus(selector) {
      await call("Page.bringToFront");
      assert.ok(await evaluate(`(()=>{const e=document.querySelector(${text(selector)});e?.focus();return !!e&&document.activeElement===e})()`), `focus ${selector}`);
    }
    async function press(key, modifiers = 0) {
      const codes = { Tab: 9, Enter: 13, Escape: 27, Backspace: 8, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, " ": 32 };
      const params = { key, code: key === " " ? "Space" : key, modifiers, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] };
      await call("Input.dispatchKeyEvent", { type: "keyDown", ...params, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) });
      await call("Input.dispatchKeyEvent", { type: "keyUp", ...params });
    }
    async function click(selector) {
      await call("Page.bringToFront");
      const rect = await evaluate(`(()=>{const e=[...document.querySelectorAll(${text(selector)})].find(e=>e.getClientRects().length);if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
      assert.ok(rect?.width > 0 && rect?.height > 0, `visible target ${selector}`);
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
      for (const type of ["mousePressed", "mouseReleased"]) await call("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    }
    async function fill(selector, value) {
      await focus(selector);
      for (const type of ["keyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type, key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2, ...(type === "keyDown" ? { commands: ["selectAll"] } : {}) });
      if (value) await call("Input.insertText", { text: value }); else await press("Backspace");
      await wait(`document.querySelector(${text(selector)})?.value===${text(value)}`, `typed ${selector}`);
    }
    async function select(selector, value) {
      const index = await evaluate(`Array.from(document.querySelector(${text(selector)})?.options??[]).findIndex(o=>o.value===${text(value)})`);
      assert.ok(index >= 0, `option ${selector}=${value}`);
      await focus(selector); await press("Home");
      for (let i = 0; i < index; i++) await press("ArrowDown");
      await press("Tab"); await wait(`document.querySelector(${text(selector)})?.value===${text(value)}`, `selected ${selector}=${value}`);
    }
    const viewport = (width) => call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    async function theme(dark) {
      if (await evaluate("document.documentElement.classList.contains('dark')") !== dark) await click('button[aria-label="Tema oscuro"]');
      await wait(`document.documentElement.classList.contains('dark')===${dark} && document.querySelector('button[aria-label="Tema oscuro"]')?.getAttribute('aria-pressed')===${text(String(dark))}`, "theme hydrated");
    }
    async function snapshot(name) {
      await evaluate("window.scrollTo(0,0)"); await sleep(80);
      const { cssContentSize } = await call("Page.getLayoutMetrics");
      const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: await evaluate("innerWidth"), height: Math.min(18000, Math.ceil(cssContentSize.height)), scale: 1 } });
      const path = resolve(artifacts, `${name.replace(/[^a-zA-Z0-9-]/g, "-")}.png`);
      await writeFile(path, Buffer.from(data, "base64")); report.screenshots.push(path);
    }
    await viewport(1280);
    return { call, evaluate, wait, navigate, focus, press, click, fill, select, viewport, theme, snapshot, close: () => rpc.send("Target.closeTarget", { targetId }) };
  }
  return { createTab, async close() {
    if (socket.readyState === WebSocket.OPEN) { try { await rpc.send("Browser.close"); } catch {} }
    socket.close(); await stopChrome();
  } };
}
