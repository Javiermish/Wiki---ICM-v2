export const materialHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  // Next may normalize request.url to localhost; Host is the browser's actual authority.
  const host = request.headers.get("host");
  if (host) expected.host = host;
  return origin !== null && origin === expected.origin;
}

/** Bound bytes even when Content-Length is missing or inaccurate. */
export async function boundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error("La petición supera el tamaño permitido.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new Error("Selecciona un archivo y vuelve a intentarlo.");
  if (!request.body) throw new Error("La petición está vacía.");
  const reader = request.body.getReader();
  let expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel(); }, 120_000);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (expired) throw new Error("La carga tardó demasiado. Reintenta con una conexión estable.");
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBytes) throw new Error("La petición supera el tamaño permitido.");
      chunks.push(chunk.value);
    }
  } finally { clearTimeout(timeout); await reader.cancel(); }
  const bytes = Buffer.concat(chunks, size);
  return new Response(bytes, { headers: { "content-type": request.headers.get("content-type")! } }).formData();
}
