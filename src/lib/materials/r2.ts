import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const maxBytes = 25 * 1024 * 1024;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const keyPattern = new RegExp(`^materials/${uuid}/${uuid}\\.(pdf|jpg|png|webp)$`);
const storageError = () => new Error('No se pudo acceder al archivo. Inténtalo nuevamente.');

function configuration() {
  const { R2_ENDPOINT: endpoint, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!endpoint || !bucket?.trim() || !accessKeyId?.trim() || !secretAccessKey?.trim()) throw storageError();
  const url = new URL(endpoint);
  const local = ['development', 'test'].includes(process.env.NODE_ENV ?? '') && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const r2 = url.protocol === 'https:' && /^[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(url.hostname) && !url.port;
  if ((!local && !r2) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw storageError();
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

export function isR2Configured(): boolean {
  try { configuration(); return true; } catch { return false; }
}

function object(key: string) {
  if (!keyPattern.test(key)) throw storageError();
  const config = configuration();
  const client = new S3Client({ endpoint: config.endpoint, region: 'auto', maxAttempts: 2, requestHandler: { requestTimeout: 60_000, connectionTimeout: 5_000, throwOnRequestTimeout: true }, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  return { client, input: { Bucket: config.bucket, Key: key } };
}

export async function putR2Object(key: string, data: Buffer, mimeType: string, sha256: string): Promise<void> {
  try {
    const { client, input } = object(key);
    const mime = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[key.split('.').at(-1) ?? ''];
    if (!data.length || data.length > maxBytes || mime !== mimeType || !/^[a-f0-9]{64}$/.test(sha256)) throw storageError();
    try {
      await client.send(new PutObjectCommand({ ...input, Body: data, ContentType: mimeType, ContentLength: data.length, Metadata: { sha256 }, IfNoneMatch: '*' }));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      const existing = await client.send(new HeadObjectCommand(input));
      if (existing.ContentLength !== data.length || existing.ContentType !== mimeType || existing.Metadata?.sha256 !== sha256) throw storageError();
    }
  } catch (cause) { throw new Error('No se pudo acceder al archivo. Inténtalo nuevamente.', { cause }); }
}

export async function readR2Object(key: string): Promise<{ data: Buffer; mimeType: string | undefined }> {
  try {
    const { client, input } = object(key);
    const result = await client.send(new GetObjectCommand(input));
    const body = result.Body;
    if (!body) throw storageError();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      if (result.ContentLength !== undefined && (!Number.isSafeInteger(result.ContentLength) || result.ContentLength <= 0 || result.ContentLength > maxBytes)) throw storageError();
      if (!(Symbol.asyncIterator in body)) throw storageError();
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) throw storageError();
        chunks.push(Buffer.from(chunk));
      }
      if (!bytes || (result.ContentLength !== undefined && bytes !== result.ContentLength)) throw storageError();
      return { data: Buffer.concat(chunks, bytes), mimeType: result.ContentType };
    } finally {
      if ('destroy' in body && typeof body.destroy === 'function') body.destroy();
    }
  } catch { throw storageError(); }
}

export async function deleteR2Object(key: string): Promise<void> {
  try {
    const { client, input } = object(key);
    await client.send(new DeleteObjectCommand(input));
  } catch { throw storageError(); }
}

export async function signR2Read(key: string, downloadName?: string): Promise<string> {
  try {
    const { client, input } = object(key);
    const safeName = downloadName?.replace(/[\x00-\x1f\x7f/\\"<>:|?*]/g, '').slice(0, 200);
    const disposition = safeName ? `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}` : undefined;
    return await getSignedUrl(client, new GetObjectCommand({ ...input, ResponseContentDisposition: disposition }), { expiresIn: 60 });
  } catch { throw storageError(); }
}
