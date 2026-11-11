import { getAccountResult } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createMaterialServiceClient } from "@/lib/materials/server-config";
import { validateUpload } from "@/lib/materials/validate-upload";
import { deleteR2Object, isR2Configured, readR2Object } from "@/lib/materials/r2";
import { confirmMaterialUpload, UploadRejectedError } from "@/lib/materials/upload-service";
import { materialHeaders, sameOrigin } from "@/lib/materials/http";
import { withUploadSlot } from "@/lib/materials/upload-limits";
import { logMaterialUploadFailure } from "@/lib/materials/upload-diagnostics";

/** Phase 2 of a contribution: the browser finished its signed PUT; only the server-side byte check may mark it ready. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const json = (body: object, status: number) => Response.json(body, { status, headers: materialHeaders });
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const account = await getAccountResult();
  if (account.status !== "authenticated") return json({ error: "Inicia sesión con una cuenta de correo verificado para aportar." }, 401);
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return json({ error: "Aporte no encontrado." }, 404);
  let service;
  try {
    if (!isR2Configured()) throw new Error();
    service = createMaterialServiceClient();
  } catch (error) {
    logMaterialUploadFailure("configuration", error);
    return json({ error: "El almacenamiento de materiales no está configurado." }, 503);
  }

  const client = await createClient();
  const { data: row, error } = await client.from("materials")
    .select("id,uploaded_by,storage_key,sha256,bytes,mime_type,upload_state,status").eq("id", id).maybeSingle();
  if (error) {
    logMaterialUploadFailure("supabase_load", error);
    return json({ error: "No se pudo consultar el aporte. Reintenta más tarde." }, 503);
  }
  // RLS already limits rows to owner/reviewer; only the owner may confirm their own upload.
  if (!row || row.uploaded_by !== account.account.id) return json({ error: "Aporte no encontrado." }, 404);

  // "slot" until withUploadSlot admits the work: only then is a thrown error the slot limit rather than the upload.
  const context: { stage: Parameters<typeof logMaterialUploadFailure>[0] | "slot" } = { stage: "slot" };
  try {
    const receipt = await withUploadSlot(() => {
      context.stage = "supabase_load";
      return confirmMaterialUpload(row, {
        read: async (key) => {
          context.stage = "r2_read";
          return (await readR2Object(key)).data;
        },
        validate: (data) => validateUpload({ name: `material.${row.storage_key.split(".").at(-1)}`, type: row.mime_type, size: data.length,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.length) as ArrayBuffer }),
        discard: async () => {
          context.stage = "discard";
          const failed = await service.rpc("fail_material_upload", { material_id: row.id, owner_id: account.account.id });
          if (failed.error) throw failed.error;
          // Best effort: if R2 is down, the admin cleanup (/api/materiales/limpieza) removes the object later.
          try {
            await deleteR2Object(row.storage_key);
            await service.rpc("mark_material_storage_deleted", { material_id: row.id });
          } catch { /* left for cleanup */ }
        },
        finalize: async (materialId) => {
          context.stage = "supabase_finalize";
          const finalized = await service.rpc("finalize_material_upload", { material_id: materialId, owner_id: account.account.id });
          if (finalized.error) throw finalized.error;
        },
      });
    });
    return json(receipt, 201);
  } catch (error) {
    if (context.stage === "slot") return json({ error: "El servidor de aportes está ocupado. Reintenta en unos minutos." }, 429);
    if (error instanceof UploadRejectedError) return json({ error: error.message }, 400);
    if (error instanceof Error && /revisado|expiró/.test(error.message)) return json({ error: error.message }, 409);
    logMaterialUploadFailure(context.stage, error);
    if (context.stage === "r2_read") return json({ error: "Aún no recibimos el archivo completo. Reintenta sin editar para usar la misma operación." }, 409);
    return json({ error: "No se pudo confirmar la recepción. Revisa Mis aportes; puedes reintentar sin cambiar los datos. Una carga incompleta nunca se publica." }, 503);
  }
}
