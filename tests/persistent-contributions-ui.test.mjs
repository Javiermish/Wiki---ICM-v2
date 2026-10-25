import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/contributions/upload-material.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { uploadMaterial } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("upload UI: multipart allowlist, actual progress, receipt and recoverable failures", async () => {
  const previous = globalThis.XMLHttpRequest;
  const requests = [];
  class FakeRequest {
    upload = {};
    constructor() { requests.push(this); }
    open(...args) { this.openArgs = args; }
    send(body) { this.body = body; }
  }
  globalThis.XMLHttpRequest = FakeRequest;
  try {
    const draft = { courseId: "course", category: "apunte", academicYear: "2025", academicTerm: "2" };
    const file = new File(["%PDF-1.7"], "local.pdf", { type: "application/pdf" });
    const operation = "d2d1aac4-3173-4a5c-adc2-6b96b59a15b8";
    const progress = [];
    const pending = uploadMaterial(draft, file, operation, (value) => progress.push(value));
    const request = requests.at(-1);
    assert.deepEqual(request.openArgs, ["POST", "/api/materiales"]);
    assert.deepEqual([...request.body.keys()], ["draft", "authorization", "operationId", "file"]);
    assert.deepEqual(JSON.parse(request.body.get("draft")), draft);
    assert.equal(request.body.get("authorization"), "true");
    assert.equal(request.body.get("operationId"), operation);
    request.upload.onprogress({ lengthComputable: true, loaded: 4, total: 8 });
    request.upload.onprogress({ lengthComputable: false });
    assert.deepEqual(progress, [50, null]);
    request.status = 201;
    request.responseText = JSON.stringify({ id: operation, status: "pending" });
    request.onload();
    assert.deepEqual(await pending, { id: operation, status: "pending" });

    for (const [status, body] of [[503, { error: "Configuración no disponible" }], [200, { id: operation, status: "approved" }], [201, {}]]) {
      const failed = uploadMaterial(draft, file, operation, () => {});
      const failedRequest = requests.at(-1);
      failedRequest.status = status;
      failedRequest.responseText = JSON.stringify(body);
      failedRequest.onload();
      await assert.rejects(failed);
      assert.equal(failedRequest.body.get("operationId"), operation);
    }
    const networkFailure = uploadMaterial(draft, file, operation, () => {});
    requests.at(-1).onerror();
    await assert.rejects(networkFailure, /No se pudo confirmar/);
  } finally { globalThis.XMLHttpRequest = previous; }
});
