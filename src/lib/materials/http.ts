export const materialHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  // Next may normalize request.url to localhost; Host is the browser's actual authority.
  const host = request.headers.get("host");
  if (host) expected.host = host;
  return origin !== null && origin === expected.origin;
}

/** Bound bytes even when Content-Length is missing or inaccurate. File bytes never pass through here: they go straight to R2. */
export async function boundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error("La petición supera el tamaño permitido.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Petición no válida.");
  if (!request.body) throw new Error("La petición está vacía.");
  const reader = request.body.getReader();
  let expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel(); }, 30_000);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (expired) throw new Error("La petición tardó demasiado. Reintenta con una conexión estable.");
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBytes) throw new Error("La petición supera el tamaño permitido.");
      chunks.push(chunk.value);
    }
  } finally { clearTimeout(timeout); await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}
