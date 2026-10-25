import { getAccountResult } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createMaterialServiceClient } from "@/lib/materials/server-config";
import { validateContributionDraft, DEFAULT_CONTRIBUTION_MAX_BYTES } from "@/domain/contribution";
import { getPublicCatalog } from "@/lib/catalog/persistent";
import { validateUpload } from "@/lib/materials/validate-upload";
import { isR2Configured, putR2Object } from "@/lib/materials/r2";
import { receiveMaterial } from "@/lib/materials/upload-service";
import { boundedFormData, materialHeaders, sameOrigin } from "@/lib/materials/http";
import { withUploadSlot } from "@/lib/materials/upload-limits";
import { logMaterialUploadFailure } from "@/lib/materials/upload-diagnostics";

export async function POST(request: Request) {
  const json = (body: object, status: number) => Response.json(body, { status, headers: materialHeaders });
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const account = await getAccountResult();
  if (account.status !== "authenticated") return json({ error: "Inicia sesión con una cuenta de correo verificado para aportar." }, 401);
  let service;
  try {
    if (!isR2Configured()) throw new Error();
    service = createMaterialServiceClient();
  } catch (error) {
    logMaterialUploadFailure("configuration", error);
    return json({ error: "El almacenamiento de materiales no está configurado. No se recibió ningún aporte." }, 503);
  }
  const client = await createClient();
  const budget = await client.rpc("authorize_material_upload_attempt");
  if (budget.error) {
    logMaterialUploadFailure("supabase_budget", budget.error);
    return json({ error: "No se pudo verificar el límite de aportes. Reintenta más tarde." }, 503);
  }
  if (budget.data !== true) return json({ error: "Alcanzaste el límite de 20 intentos en 15 minutos. Espera antes de reintentar." }, 429);
  try {
    return await withUploadSlot(() => receiveUpload(request, account.account.id, service, client));
  } catch { return json({ error: "El servidor de aportes está ocupado. Reintenta en unos minutos." }, 429); }
}

async function receiveUpload(request: Request, ownerId: string, service: ReturnType<typeof createMaterialServiceClient>, client: Awaited<ReturnType<typeof createClient>>) {
  const json = (body: object, status: number) => Response.json(body, { status, headers: materialHeaders });
  let form, file, draft, description, operationId;
  try {
    form = await boundedFormData(request, DEFAULT_CONTRIBUTION_MAX_BYTES + 64 * 1024);
    if (form.get("authorization") !== "true") throw new Error("Confirma que tienes autorización para compartir el material.");
    operationId = form.get("operationId");
    if (typeof operationId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(operationId)) throw new Error("Identificador de subida no válido.");
    const rawDraft = form.get("draft");
    if (typeof rawDraft !== "string" || rawDraft.length > 10000) throw new Error("Metadatos no válidos.");
    draft = JSON.parse(rawDraft);
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Metadatos no válidos.");
    description = typeof draft.description === "string" ? draft.description.trim() : null;
    if (description && description.length > 2000) throw new Error("La descripción admite hasta 2000 caracteres.");
    file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1) throw new Error("Selecciona un único archivo.");
    if (!file.name || file.name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(file.name)) throw new Error("Usa un nombre de archivo de hasta 255 caracteres, sin rutas ni caracteres de control.");
  } catch (error) { return json({ error: error instanceof SyntaxError ? "Metadatos no válidos." : error instanceof Error ? error.message : "Petición no válida." }, 400); }
  let validated;
  try { validated = await validateUpload(file); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Archivo no válido." }, 400); }
  const context: { stage: Parameters<typeof logMaterialUploadFailure>[0] } = { stage: "catalog" };
  try {
    const metadata = validateContributionDraft(draft, (await getPublicCatalog()).courses);
    if (!metadata.ok) return json({ error: Object.values(metadata.errors).join(" ") }, 400);
    const receipt = await receiveMaterial({
      reserve: async () => {
        context.stage = "supabase_reserve";
        const { data, error } = await client.rpc("reserve_material_upload", {
          operation_id: operationId, metadata: { ...metadata.value, description }, filename: file.name,
          file_mime: validated.mimeType, file_bytes: validated.bytes, file_extension: validated.extension, file_sha256: validated.sha256,
        });
        if (error) throw error;
        if (!data) throw new Error("No se pudo reservar el aporte. Comprueba si ya existe en Mis aportes y reintenta con el mismo archivo.");
        return Array.isArray(data) ? data[0] : data;
      },
      put: async (...args) => {
        context.stage = "r2_put";
        await putR2Object(...args);
      },
      finalize: async (id) => {
        context.stage = "supabase_finalize";
        const { error } = await service.rpc("finalize_material_upload", { material_id: id, owner_id: ownerId });
        if (error) throw error;
      },
    }, validated);
    return json(receipt, 201);
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
    return json({ error: "No se pudo confirmar la recepción. Revisa Mis aportes; puedes reintentar sin cambiar los datos. Una carga incompleta nunca se publica." }, 503);
  }
}
