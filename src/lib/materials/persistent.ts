import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { requireAccount, requireRole } from "@/lib/auth/session";
import type { PublicMaterialRow } from "./rows";

export interface PersistentMaterial extends PublicMaterialRow {
  status: "pending" | "approved" | "rejected";
  upload_state: "uploading" | "ready" | "failed";
  submitted_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
}

export const publicMaterialColumns = "id,offering_id,course_id,academic_year,academic_term,category,document_number,title,description,section,instructor,version,mime_type,bytes,extension";
const privateColumns = "id,offering_id,category,document_number,title,description,section,instructor,version,mime_type,bytes,extension,status,upload_state,submitted_at,review_notes,reviewed_at,course_offerings!inner(course_id,academic_year,academic_term)";

export function anonymousMaterialsClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("No se pudo conectar con el catálogo de materiales.");
  return createSupabaseClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export async function readApprovedMaterialRows(client: SupabaseClient): Promise<PublicMaterialRow[]> {
  const rows: PublicMaterialRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("public_materials").select(publicMaterialColumns).order("id").range(offset, offset + 499);
    if (error || !data) throw new Error("No se pudieron cargar los materiales desde PostgreSQL. Comprueba la migración del Hito 2.3.", { cause: error });
    rows.push(...data as PublicMaterialRow[]);
    if (data.length < 500) return rows;
  }
}

export async function getApprovedMaterialRow(id: string): Promise<PublicMaterialRow | null> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await anonymousMaterialsClient().from("public_materials").select(publicMaterialColumns).eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo consultar el material.");
  return data as PublicMaterialRow | null;
}

async function listMaterials(review: boolean, page = 1): Promise<PersistentMaterial[]> {
  const account = review ? await requireRole(["moderator", "admin"], "/moderacion") : await requireAccount("/mis-aportes");
  const client = await createClient();
  let query = client.from("materials").select(privateColumns).order("submitted_at", { ascending: false }).order("id");
  query = review ? query.eq("status", "pending").eq("upload_state", "ready") : query.eq("uploaded_by", account.id);
  const offset = (Number.isSafeInteger(page) && page > 0 && page <= 999999 ? page - 1 : 0) * 50;
  const { data, error } = await query.range(offset, offset + 49);
  if (error || !data) throw new Error("No se pudieron cargar los aportes. Comprueba la conexión y las migraciones.");
  return data.map(({ course_offerings, ...row }) => ({ ...row, ...(course_offerings as unknown as { course_id: string; academic_year: number; academic_term: 1 | 2 }) })) as PersistentMaterial[];
}

export async function getOwnMaterials(page = 1) { return listMaterials(false, page); }
export async function getReviewMaterials(page = 1) { return listMaterials(true, page); }
