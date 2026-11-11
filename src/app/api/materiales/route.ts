import { getAccountResult } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validateContributionDraft } from "@/domain/contribution";
import { getPublicCatalog } from "@/lib/catalog/persistent";
import { describeUpload } from "@/lib/materials/validate-upload";
import { isR2Configured, signR2Upload } from "@/lib/materials/r2";
import { prepareMaterialUpload } from "@/lib/materials/upload-service";
import { boundedJson, materialHeaders, sameOrigin } from "@/lib/materials/http";
import { logMaterialUploadFailure } from "@/lib/materials/upload-diagnostics";

/**
 * Phase 1 of a contribution: metadata only (a few KB). The file goes from the browser straight to R2 with the
 * signed URL returned here, so no serverless body limit applies; /api/materiales/[id]/confirmar validates it.
 */
export async function POST(request: Request) {
  const json = (body: object, status: number) => Response.json(body, { status, headers: materialHeaders });
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const account = await getAccountResult();
  if (account.status !== "authenticated") return json({ error: "Inicia sesión con una cuenta de correo verificado para aportar." }, 401);
  if (!isR2Configured()) {
    logMaterialUploadFailure("configuration", null);
    return json({ error: "El almacenamiento de materiales no está configurado. No se recibió ningún aporte." }, 503);
  }
  const client = await createClient();
  const budget = await client.rpc("authorize_material_upload_attempt");
  if (budget.error) {
    logMaterialUploadFailure("supabase_budget", budget.error);
    return json({ error: "No se pudo verificar el límite de aportes. Reintenta más tarde." }, 503);
  }
  if (budget.data !== true) return json({ error: "Alcanzaste el límite de 20 intentos en 15 minutos. Espera antes de reintentar." }, 429);

  let draft, description, operationId, declared, format;
  try {
    const body = await boundedJson(request, 16 * 1024) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Petición no válida.");
    if (body.authorization !== true) throw new Error("Confirma que tienes autorización para compartir el material.");
    operationId = body.operationId;
    if (typeof operationId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(operationId)) throw new Error("Identificador de subida no válido.");
    draft = body.draft as Record<string, unknown>;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Metadatos no válidos.");
    description = typeof draft.description === "string" ? draft.description.trim() : null;
    if (description && description.length > 2000) throw new Error("La descripción admite hasta 2000 caracteres.");
    declared = body.file as { name?: unknown; type?: unknown; size?: unknown; sha256?: unknown } | null;
    if (!declared || typeof declared !== "object" || typeof declared.name !== "string" || typeof declared.type !== "string"
      || typeof declared.size !== "number" || typeof declared.sha256 !== "string") throw new Error("Selecciona un único archivo.");
    if (!declared.name || declared.name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(declared.name)) throw new Error("Usa un nombre de archivo de hasta 255 caracteres, sin rutas ni caracteres de control.");
    if (!/^[a-f0-9]{64}$/.test(declared.sha256)) throw new Error("Huella del archivo no válida.");
    format = describeUpload({ name: declared.name, type: declared.type, size: declared.size });
  } catch (error) { return json({ error: error instanceof SyntaxError ? "Metadatos no válidos." : error instanceof Error ? error.message : "Petición no válida." }, 400); }

  const file = { name: declared.name as string, size: declared.size as number, sha256: declared.sha256 as string, ...format };
  const context: { stage: Parameters<typeof logMaterialUploadFailure>[0] } = { stage: "catalog" };
  try {
    // Untrusted shape: validateContributionDraft is the allowlist that checks every field.
    const metadata = validateContributionDraft(draft as unknown as Parameters<typeof validateContributionDraft>[0], (await getPublicCatalog()).courses);
    if (!metadata.ok) return json({ error: Object.values(metadata.errors).join(" ") }, 400);
    const prepared = await prepareMaterialUpload({
      reserve: async () => {
        context.stage = "supabase_reserve";
        // The hash is the browser's claim; confirmar recomputes it from the stored bytes before finalizing.
        const { data, error } = await client.rpc("reserve_material_upload", {
          operation_id: operationId, metadata: { ...metadata.value, description }, filename: file.name,
          file_mime: file.mimeType, file_bytes: file.size, file_extension: file.extension, file_sha256: file.sha256,
        });
        if (error) throw error;
        if (!data) throw new Error("No se pudo reservar el aporte. Comprueba si ya existe en Mis aportes y reintenta con el mismo archivo.");
        return Array.isArray(data) ? data[0] : data;
      },
      sign: async (key) => {
        context.stage = "r2_sign";
        return signR2Upload(key, file.mimeType, file.size);
      },
    });
    if (prepared.kind === "received") return json(prepared.receipt, 201);
    return json({ id: prepared.id, status: "uploading", uploadUrl: prepared.uploadUrl, uploadHeaders: { "Content-Type": file.mimeType, "If-None-Match": "*" } }, 200);
  } catch (error) {
    logMaterialUploadFailure(context.stage, error);
    // SQLSTATE 22023 is an input/quota rejection, not a storage outage.
    if (context.stage === "supabase_reserve" && error && typeof error === "object" && "code" in error && error.code === "22023") {
      if ("message" in error && error.message === "Upload quota exceeded") {
        return json({ error: "Alcanzaste el límite de aportes pendientes o diarios. Espera antes de reintentar." }, 429);
      }
      const taskSchemaMismatch = draft.category === "tarea" && "message" in error && error.message === "Invalid upload metadata";
      return json({ error: taskSchemaMismatch
        ? "La base de datos rechazó Tareas. Un administrador debe comprobar la migración de Tareas (202610240001_material_tasks.sql) antes de reintentar. No se recibió el aporte."
        : "La base de datos rechazó los metadatos. Revisa el ramo activo, el tipo, el número y el período académico. No se recibió el aporte." }, 400);
    }
    if (context.stage === "supabase_reserve" && error instanceof Error && /revisado|expiró/.test(error.message)) return json({ error: error.message }, 409);
    return json({ error: "No se pudo preparar la subida. Revisa Mis aportes; puedes reintentar sin cambiar los datos. Una carga incompleta nunca se publica." }, 503);
  }
}
