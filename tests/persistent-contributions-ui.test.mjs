import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/contributions/upload-material.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { uploadMaterial } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const draft = { courseId: "course", category: "apunte", academicYear: "2025", academicTerm: "2" };
const operation = "d2d1aac4-3173-4a5c-adc2-6b96b59a15b8";
const signedHeaders = { "Content-Type": "application/pdf", "If-None-Match": "*" };

/** Fake transports: fetch for the two JSON calls, XHR for the direct R2 PUT (the only one with progress). */
function transports({ reserve, putStatus = 200, confirm }) {
  const posts = [], puts = [];
  const previous = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest };
  globalThis.fetch = async (url, init) => {
    posts.push({ url, init, body: JSON.parse(init.body) });
    const [status, body] = url === "/api/materiales" ? reserve : confirm;
    if (status === "network") throw new TypeError("offline");
    return new Response(JSON.stringify(body), { status });
  };
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    constructor() { puts.push(this); }
    open(...args) { this.openArgs = args; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      this.body = body;
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 8 });
        if (putStatus === "network") { this.onerror(); return; }
        this.status = putStatus;
        this.onload();
      });
    }
  };
  const restore = () => { globalThis.fetch = previous.fetch; globalThis.XMLHttpRequest = previous.XMLHttpRequest; };
  return { posts, puts, restore };
}

test("upload UI: metadata allowlist, direct signed PUT with progress, then server confirmation", async () => {
  const file = new File(["%PDF-1.7"], "local.pdf", { type: "application/pdf" });
  const { posts, puts, restore } = transports({
    reserve: [200, { id: operation, status: "uploading", uploadUrl: "https://bucket.r2.example/put?sig=1", uploadHeaders: { ...signedHeaders, "X-Injected": "no" } }],
    confirm: [201, { id: operation, status: "pending" }],
  });
  try {
    const progress = [];
    assert.deepEqual(await uploadMaterial(draft, file, operation, (value) => progress.push(value)), { id: operation, status: "pending" });
    assert.deepEqual(posts.map(({ url, init }) => [url, init.method]), [["/api/materiales", "POST"], [`/api/materiales/${operation}/confirmar`, "POST"]]);
    const reservation = posts[0].body;
    assert.deepEqual(Object.keys(reservation), ["draft", "authorization", "operationId", "file"]);
    assert.deepEqual(reservation.draft, draft);
    assert.equal(reservation.authorization, true);
    assert.equal(reservation.operationId, operation);
    assert.deepEqual(reservation.file, { name: "local.pdf", type: "application/pdf", size: 8, sha256: createHash("sha256").update("%PDF-1.7").digest("hex") });
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].openArgs, ["PUT", "https://bucket.r2.example/put?sig=1"]);
    assert.deepEqual(puts[0].headers, signedHeaders);
    assert.equal(puts[0].body, file);
    assert.deepEqual(progress, [null, 50]);
  } finally { restore(); }
});

test("upload UI: lost responses are idempotent; failures are recoverable and never fake a receipt", async () => {
  const file = new File(["%PDF-1.7"], "local.pdf", { type: "application/pdf" });
  const uploading = [200, { id: operation, status: "uploading", uploadUrl: "https://bucket.r2.example/put", uploadHeaders: signedHeaders }];
  const received = [201, { id: operation, status: "pending" }];

  let transport = transports({ reserve: received });
  try {
    assert.deepEqual(await uploadMaterial(draft, file, operation, () => {}), { id: operation, status: "pending" });
    assert.equal(transport.puts.length, 0);
  } finally { transport.restore(); }

  transport = transports({ reserve: uploading, putStatus: 412, confirm: received });
  try { assert.deepEqual(await uploadMaterial(draft, file, operation, () => {}), { id: operation, status: "pending" }); }
  finally { transport.restore(); }

  for (const scenario of [
    { reserve: [503, { error: "Configuración no disponible" }], message: /Configuración no disponible/ },
    { reserve: [200, { id: operation, status: "approved" }] },
    { reserve: [201, {}] },
    { reserve: ["network"], message: /No se pudo confirmar/ },
    { reserve: uploading, putStatus: 403, message: /No se pudo confirmar/ },
    { reserve: uploading, putStatus: "network", message: /No se pudo confirmar/ },
    { reserve: uploading, confirm: [409, { error: "Aún no recibimos el archivo completo." }], message: /Aún no recibimos/ },
    { reserve: uploading, confirm: [400, { error: "PDF no permitido." }], message: /PDF no permitido/ },
    { reserve: uploading, confirm: [200, { id: operation, status: "approved" }] },
  ]) {
    transport = transports(scenario);
    try {
      await assert.rejects(uploadMaterial(draft, file, operation, () => {}), scenario.message);
      assert.ok(transport.posts.every(({ body }) => !("operationId" in body) || body.operationId === operation));
    } finally { transport.restore(); }
  }
});
