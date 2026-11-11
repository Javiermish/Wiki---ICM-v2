import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { hasExpectedSignature } from './file-metadata';

const maxBytes = 25 * 1024 * 1024;
const formats = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
type Extension = keyof typeof formats;
type Upload = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

function nonempty(value: unknown): boolean {
  if (!value) return false;
  if (value instanceof Map) return value.size > 0;
  return typeof value === 'object' ? Object.keys(value).length > 0 : true;
}

async function validatePdf(data: Buffer) {
  // Supplemental only: PDF.js below resolves compressed objects and action trees.
  const names = data.toString('latin1').replace(/#([a-f\d]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  if (!/%%EOF\s*$/.test(names) || /\/(?:Encrypt|JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|SubmitForm|ImportData|GoToR)\b/.test(names)) throw new Error('PDF no permitido.');
  const options = { data: Uint8Array.from(data), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: true };
  const task = getDocument(options);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // shortcut: timeout cannot preempt synchronous parser work; isolate in a worker/process before accepting hostile high-volume traffic.
    await Promise.race([
      (async () => {
        const pdf = await task.promise;
        if (pdf.numPages < 1 || pdf.numPages > 1000) throw new Error('PDF no permitido.');
        if (nonempty(await pdf.getJSActions()) || nonempty(await pdf.getAttachments()) || nonempty(await pdf.getOpenAction())) throw new Error('PDF no permitido.');
        let operators = 0;
        for (let index = 1; index <= pdf.numPages; index++) {
          const page = await pdf.getPage(index);
          try {
            if (nonempty(await page.getJSActions())) throw new Error('PDF no permitido.');
            const annotations = await page.getAnnotations();
            for (const annotation of annotations) {
              if (annotation.unsafeJS || nonempty(annotation.actions) || annotation.attachment || annotation.file || annotation.annotationType === 17 || /^(?:FileAttachment|RichMedia|Screen|Movie|Sound)$/i.test(annotation.subtype ?? '')) throw new Error('PDF no permitido.');
            }
            await page.getTextContent();
            const list = await page.getOperatorList();
            operators += list.fnArray.length;
            if (operators > 200_000) throw new Error('PDF demasiado complejo.');
          } finally { page.cleanup(); }
        }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PDF demasiado complejo.')), 15_000); }),
    ]);
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}

const invalidUpload = 'Archivo no válido o no permitido. Usa PDF, JPEG, PNG o WebP de hasta 25 MiB, sin contenido activo.';

/** Declared name/type/size only: lets a reservation fail fast before any byte reaches R2. Never a substitute for validateUpload. */
export function describeUpload(file: { name: string; type: string; size: number }): { mimeType: typeof formats[Extension]; extension: Extension } {
  const suffix = file.name.split('.').at(-1)?.toLowerCase();
  const extension = suffix === 'jpeg' ? 'jpg' : suffix;
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxBytes || !extension || !Object.hasOwn(formats, extension)
    || file.type !== formats[extension as Extension]) throw new Error(invalidUpload);
  return { mimeType: formats[extension as Extension], extension: extension as Extension };
}

export async function validateUpload(file: Upload): Promise<{ data: Buffer; mimeType: typeof formats[Extension]; extension: Extension; sha256: string; bytes: number }> {
  try {
    const { extension: ext } = describeUpload(file);
    const data = Buffer.from(await file.arrayBuffer());
    if (data.length !== file.size || data.length > maxBytes || !hasExpectedSignature(data, ext)) throw new Error();
    if (ext === 'pdf') await validatePdf(data);
    else {
      const image = sharp(data, { limitInputPixels: 40_000_000, failOn: 'warning' });
      const metadata = await image.metadata();
      const expectedFormat = ext === 'jpg' ? 'jpeg' : ext;
      if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width > 20_000 || metadata.height > 20_000 || metadata.width * metadata.height > 40_000_000 || (metadata.pages ?? 1) > 1) throw new Error();
      await image.raw().toBuffer();
    }
    return { data, mimeType: formats[ext], extension: ext, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length };
  } catch {
    throw new Error(invalidUpload);
  }
}
