import "server-only";
import type { PublicMaterialFile } from "@/domain/material-file";
import { createClient } from "@/lib/supabase/server";
import { getAccountResult } from "@/lib/auth/session";
import { materialDisplayName } from "@/lib/catalog/query";
import { getApprovedMaterialRow } from "./persistent";
import { createMaterialServiceClient } from "./server-config";
import { signR2Read } from "./r2";
import { fileFormats, normalizedDownloadName } from "./file-metadata";
import type { PublicMaterialRow } from "./rows";

export function storedFileMetadata(row: PublicMaterialRow, privateAccess = false): PublicMaterialFile {
  const url = privateAccess ? `/api/materiales/${encodeURIComponent(row.id)}/archivo` : `/materiales/${encodeURIComponent(row.id)}/archivo`;
  const displayName = materialDisplayName({ category: row.category, documentNumber: row.document_number }, { academicYear: row.academic_year, academicTerm: row.academic_term });
  return { ...fileFormats[row.extension], extension: row.extension, bytes: row.bytes,
    url, downloadUrl: `${url}?descargar=1`, downloadName: normalizedDownloadName(displayName, row.extension) };
}

/** Authorizes access and resolves the private R2 key; bytes are never read here (see storedFileRedirect). */
export async function resolveStoredMaterialFile(id: string, privateAccess = false): Promise<{ file: PublicMaterialFile; key: string } | null> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
  if (privateAccess) {
    const account = await getAccountResult();
    if (account.status !== "authenticated") return null;
    const client = await createClient();
    const { data, error } = await client.from("materials").select("*,course_offerings!inner(course_id,academic_year,academic_term)").eq("id", id).eq("upload_state", "ready").maybeSingle();
    if (error) throw new Error("No se pudo consultar el archivo.");
    if (!data) return null;
    // RLS is authoritative; this check is an additional boundary, never a substitute.
    if (data.uploaded_by !== account.account.id && !["moderator", "admin"].includes(account.account.role)) return null;
    return { file: storedFileMetadata({ ...data, ...data.course_offerings }, true), key: data.storage_key };
  }
  const approved = await getApprovedMaterialRow(id);
  if (!approved) return null;
  const { data, error } = await createMaterialServiceClient().from("materials").select("storage_key").eq("id", id).eq("status", "approved").eq("upload_state", "ready").maybeSingle();
  if (error) throw new Error("No se pudo consultar el archivo.");
  if (!data) return null;
  return { file: storedFileMetadata(approved), key: data.storage_key };
}

/**
 * Redirect to a 60-second signed R2 URL instead of proxying bytes: serverless responses are capped (~4.5 MB on
 * Vercel) and files reach 25 MiB. Bytes were hash-checked when the upload was confirmed and the key is write-once.
 */
export async function storedFileRedirect(request: Request, resolved: { file: PublicMaterialFile; key: string }): Promise<Response> {
  const disposition = new URL(request.url).searchParams.get("descargar") === "1" ? "attachment" : "inline";
  const location = await signR2Read(resolved.key, resolved.file.downloadName, disposition);
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

/** Local demo samples only (public/demo): small files served from this origin. */
export function materialFileResponse(request: Request, resolved: { file: PublicMaterialFile; data: Buffer }): Response {
  const { file, data } = resolved;
  const disposition = new URL(request.url).searchParams.get("descargar") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(data), { headers: {
    "Content-Type": file.mimeType, "Content-Length": String(data.length),
    "Content-Disposition": `${disposition}; filename="${file.downloadName}"; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
