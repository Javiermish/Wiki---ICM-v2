import { getAccountResult } from "@/lib/auth/session";
import { createMaterialServiceClient } from "@/lib/materials/server-config";
import { deleteR2Object } from "@/lib/materials/r2";
import { sameOrigin, materialHeaders } from "@/lib/materials/http";

/** Explicit admin-only maintenance; never removes academic rows or ready files. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: materialHeaders });
  const account = await getAccountResult();
  if (account.status !== "authenticated" || account.account.role !== "admin") return Response.json({ error: "No autorizado." }, { status: 403, headers: materialHeaders });
  try {
    const service = createMaterialServiceClient();
    const { error: expireError } = await service.rpc("expire_material_uploads");
    if (expireError) throw new Error();
    const { data, error } = await service.from("materials").select("id,storage_key").eq("upload_state", "failed").is("storage_deleted_at", null).order("updated_at").limit(100);
    if (error || !data) throw new Error();
    let deleted = 0;
    for (const row of data) {
      await deleteR2Object(row.storage_key);
      const { error: markError } = await service.rpc("mark_material_storage_deleted", { material_id: row.id });
      if (markError) throw new Error();
      deleted += 1;
    }
    return Response.json({ deleted, message: "Limpieza idempotente de cargas fallidas; registros académicos conservados." }, { headers: materialHeaders });
  } catch { return Response.json({ error: "La limpieza no terminó. Puede repetirse sin borrar materiales listos." }, { status: 503, headers: materialHeaders }); }
}
