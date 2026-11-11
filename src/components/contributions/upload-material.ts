import type { ContributionDraft, ContributionReceipt } from "@/domain/contribution";

const retryMessage = "No se pudo confirmar la recepción. Conservamos tu selección; reintenta sin editar para usar la misma operación.";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function postJson(url: string, body: object): Promise<{ status: number; data: Record<string, unknown> | null }> {
  let response;
  try { response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error(retryMessage); }
  try { return { status: response.status, data: await response.json() }; }
  catch { throw new Error(retryMessage); }
}

function receiptFrom({ status, data }: { status: number; data: Record<string, unknown> | null }): ContributionReceipt | null {
  return status === 201 && typeof data?.id === "string" && data.status === "pending" ? { id: data.id, status: "pending" } : null;
}

function failure(data: Record<string, unknown> | null): Error {
  return new Error(typeof data?.error === "string" ? data.error : "No se pudo confirmar la recepción. Reintenta sin editar para conservar la misma operación.");
}

/** The file goes straight to private R2 storage; only the server's PUT URL can write it, and only for this reservation. */
function putFile(url: string, headers: Record<string, string>, file: File, onProgress: (percent: number | null) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 180000;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null);
    const failed = () => reject(new Error(retryMessage));
    request.onerror = failed;
    request.ontimeout = failed;
    request.onabort = failed;
    // 412: the object already exists from an earlier attempt whose response was lost; confirmar checks its bytes.
    request.onload = () => (request.status >= 200 && request.status < 300) || request.status === 412 ? resolve() : failed();
    request.send(file);
  });
}

/** Transport progress is not confirmation of receipt; only a valid 201 from the server is. */
export async function uploadMaterial(draft: ContributionDraft, file: File, operationId: string, onProgress: (percent: number | null) => void): Promise<ContributionReceipt> {
  onProgress(null);
  const sha256 = await sha256Hex(file);
  const reserved = await postJson("/api/materiales", {
    draft, authorization: true, operationId,
    file: { name: file.name, type: file.type, size: file.size, sha256 },
  });
  // Lost response after an earlier successful retry: the server already holds this exact upload.
  const earlier = receiptFrom(reserved);
  if (earlier) return earlier;
  const { data } = reserved;
  if (reserved.status !== 200 || typeof data?.id !== "string" || data.status !== "uploading" || typeof data.uploadUrl !== "string") throw failure(data);
  // Only the headers the server signed; anything else would invalidate the signature.
  const signed = (data.uploadHeaders ?? {}) as Record<string, unknown>;
  const headers = Object.fromEntries(["Content-Type", "If-None-Match"].flatMap((name) => typeof signed[name] === "string" ? [[name, signed[name] as string]] : []));
  await putFile(data.uploadUrl, headers, file, onProgress);
  const confirmed = await postJson(`/api/materiales/${encodeURIComponent(data.id)}/confirmar`, {});
  const receipt = receiptFrom(confirmed);
  if (receipt) return receipt;
  throw failure(confirmed.data);
}
