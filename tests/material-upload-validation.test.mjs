import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { hasExpectedSignature } from '../src/lib/materials/file-metadata.ts';

async function validator(parser = getDocument) {
  const source = (await readFile(new URL('../src/lib/materials/validate-upload.ts', import.meta.url), 'utf8')).replace(/^import .*?;$/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('export ', '');
  return new Function('createHash', 'sharp', 'getDocument', 'hasExpectedSignature', `${js};return validateUpload;`)(createHash, sharp, parser, hasExpectedSignature);
}
const file = (data, name, type, size = data.length) => ({ name, type, size, arrayBuffer: async () => Uint8Array.from(data).buffer });

test('validates all real demo formats including the small original PDF', async () => {
  const validate = await validator();
  for (const [name, type, ext] of [['calculo-certamen-demo.pdf', 'application/pdf', 'pdf'], ['calculo-listado-demo.png', 'image/png', 'png'], ['calculo-funciones-demo.jpg', 'image/jpeg', 'jpg'], ['calculo-apuntes-demo.webp', 'image/webp', 'webp']]) {
    const data = await readFile(new URL(`../public/demo/${name}`, import.meta.url));
    const result = await validate(file(data, name, type));
    assert.deepEqual(result, { data, mimeType: type, extension: ext, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    await assert.rejects(validate(file(data.subarray(0, Math.floor(data.length / 2)), name, type)));
    await assert.rejects(validate(file(data, name, 'text/html')));
    await assert.rejects(validate(file(data, name, type, data.length + 1)));
  }
});

test('rejects forged signatures, empty files, oversized declared/actual bytes and parser errors safely', async () => {
  const validate = await validator();
  for (const f of [file(Buffer.from('%PDF-1.7\n%%EOF'), 'fake.pdf', 'application/pdf'), file(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), 'fake.png', 'image/png'), file(Buffer.alloc(0), 'empty.pdf', 'application/pdf'), file(Buffer.alloc(1), 'big.pdf', 'application/pdf', 25 * 1024 * 1024 + 1), file(Buffer.alloc(25 * 1024 * 1024 + 1), 'big.pdf', 'application/pdf', 1), { name: 'x.pdf', type: 'application/pdf', size: 1, arrayBuffer: async () => { throw new Error('secret parser details'); } }]) {
    await assert.rejects(validate(f), error => error instanceof Error && !error.message.includes('secret'));
  }
});

test('rejects PDFs carrying JavaScript, launch and embedded-file tokens even in parser recovery cases', async () => {
  const validate = await validator();
  const original = await readFile(new URL('../public/demo/calculo-certamen-demo.pdf', import.meta.url));
  for (const action of ['/JavaScript /JS (app.alert\(1\))', '/Launch', '/EmbeddedFile', '/RichMedia', '/J#61vaScript', '/Encrypt']) {
    const data = Buffer.concat([original, Buffer.from(`\n1 0 obj << /S ${action} >> endobj\n%%EOF`)]);
    await assert.rejects(validate(file(data, 'active.pdf', 'application/pdf')));
  }
});

test('rejects image dimensions and pixel count before decoding', async () => {
  const validate = await validator();
  for (const [width, height] of [[20001, 1], [6400, 6400]]) {
    const data = await sharp({ create: { width, height, channels: 3, background: 'white' } }).png().toBuffer();
    await assert.rejects(validate(file(data, 'large.png', 'image/png')));
  }
});

test('parser findings reject active content, encrypted PDFs, excessive pages and operations; always destroys task', async () => {
  const data = await readFile(new URL('../public/demo/calculo-certamen-demo.pdf', import.meta.url));
  for (const variant of ['javascript', 'attachments', 'open', 'page-js', 'annotation', 'pages', 'operators', 'encrypted']) {
    let destroyed = false;
    const validate = await validator(options => {
      assert.equal(options.isEvalSupported, false);
      assert.equal(options.stopAtErrors, true);
      assert.equal(options.disableFontFace, true);
      assert.equal(options.useSystemFonts, false);
      return {
        destroy: async () => { destroyed = true; },
        promise: variant === 'encrypted' ? Promise.reject(new Error('PasswordException secret')) : Promise.resolve({
          numPages: variant === 'pages' ? 1001 : 1,
          getJSActions: async () => variant === 'javascript' ? new Map([['Open', ['alert(1)']]]) : null,
          getAttachments: async () => variant === 'attachments' ? new Map([['evil', {}]]) : null,
          getOpenAction: async () => variant === 'open' ? { action: 'Launch' } : null,
          getPage: async () => ({
            getJSActions: async () => variant === 'page-js' ? { AA: ['alert(1)'] } : null,
            getAnnotations: async () => variant === 'annotation' ? [{ annotationType: 17 }] : [],
            getTextContent: async () => ({}),
            getOperatorList: async () => ({ fnArray: Array(variant === 'operators' ? 200001 : 1) }),
            cleanup() {},
          }),
        }),
      };
    });
    await assert.rejects(validate(file(data, 'x.pdf', 'application/pdf')), error => !error.message.includes('secret'));
    assert.equal(destroyed, true, variant);
  }
});
