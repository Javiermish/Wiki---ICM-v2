import "server-only";
import { createHash } from "node:crypto";
import type { PublicMaterialFile } from "@/domain/material-file";
import { createClient } from "@/lib/supabase/server";
import { getAccountResult } from "@/lib/auth/session";
import { materialDisplayName } from "@/lib/catalog/query";
import { getApprovedMaterialRow } from "./persistent";
import { createMaterialServiceClient } from "./server-config";
import { readR2Object } from "./r2";
import { fileFormats, normalizedDownloadName } from "./file-metadata";
import type { PublicMaterialRow } from "./rows";

export function storedFileMetadata(row: PublicMaterialRow, privateAccess = false): PublicMaterialFile {
  const url = privateAccess ? `/api/materiales/${encodeURIComponent(row.id)}/archivo` : `/materiales/${encodeURIComponent(row.id)}/archivo`;
  const displayName = materialDisplayName({ category: row.category, documentNumber: row.document_number }, { academicYear: row.academic_year, academicTerm: row.academic_term });
  return { ...fileFormats[row.extension], extension: row.extension, bytes: row.bytes,
    url, downloadUrl: `${url}?descargar=1`, downloadName: normalizedDownloadName(displayName, row.extension) };
}

export async function readStoredMaterialFile(id: string, privateAccess = false): Promise<{ file: PublicMaterialFile; data: Buffer } | null> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
  let row: PublicMaterialRow;
  let key: string;
  let sha256: string;
  if (privateAccess) {
    const account = await getAccountResult();
    if (account.status !== "authenticated") return null;
    const client = await createClient();
    const { data, error } = await client.from("materials").select("*,course_offerings!inner(course_id,academic_year,academic_term)").eq("id", id).eq("upload_state", "ready").maybeSingle();
    if (error) throw new Error("No se pudo consultar el archivo.");
    if (!data) return null;
    // RLS is authoritative; this check is an additional boundary, never a substitute.
    if (data.uploaded_by !== account.account.id && !["moderator", "admin"].includes(account.account.role)) return null;
    row = { ...data, ...data.course_offerings };
    key = data.storage_key;
    sha256 = data.sha256;
  } else {
    const approved = await getApprovedMaterialRow(id);
    if (!approved) return null;
    row = approved;
    const { data, error } = await createMaterialServiceClient().from("materials").select("storage_key,sha256").eq("id", id).eq("status", "approved").eq("upload_state", "ready").maybeSingle();
    if (error) throw new Error("No se pudo consultar el archivo.");
    if (!data) return null;
    key = data.storage_key;
    sha256 = data.sha256;
  }
  const object = await readR2Object(key);
  if (object.data.length !== row.bytes || object.mimeType !== row.mime_type || createHash("sha256").update(object.data).digest("hex") !== sha256) throw new Error("No se pudo verificar la integridad del archivo.");
  return { data: object.data, file: storedFileMetadata(row, privateAccess) };
}

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
