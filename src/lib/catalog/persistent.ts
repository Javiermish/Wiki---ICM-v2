import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireAccount, requireRole } from "@/lib/auth/session";
import { getPublicDemoCatalog } from "./data";
import { attachExampleMaterials, courseFromRow } from "./rows";
import type { PublicCatalog } from "@/domain/catalog";
import { requestPageSize, type RequestStatusFilter } from "./request-pagination";

export const courseColumns = "id,slug,curriculum_id,name,code,description,kind,curricular_semester,elective_area_id,status,version";
export const catalogUnavailable = "No se pudo cargar el catálogo desde PostgreSQL. Comprueba la conexión y las migraciones e inténtalo de nuevo. No se muestran ramos de demostración como reemplazo.";

async function readCatalog(client: SupabaseClient, includeArchived = false): Promise<PublicCatalog> {
  let query = client.from("courses").select(courseColumns).order("name").order("id");
  if (!includeArchived) query = query.eq("status", "active");
  // Range pagination avoids Supabase's default 1000-row response truncation.
  const courses = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error || !result.data) throw new Error(catalogUnavailable);
    courses.push(...result.data.map(courseFromRow));
    if (result.data.length < 500) break;
  }
  const areas = await client.from("elective_areas").select("id,name").order("position");
  if (areas.error || !areas.data) throw new Error(catalogUnavailable);
  return attachExampleMaterials(courses, areas.data, getPublicDemoCatalog());
}

/** Request-only deduplication: no authenticated cookies, no shared role cache. */
export const getPublicCatalog = cache(async (): Promise<PublicCatalog> => {
  await connection();
  const config = getSupabaseConfig();
  if (!config) throw new Error(catalogUnavailable);
  const client = createSupabaseClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return readCatalog(client);
});

export async function getAdministrationCatalog(): Promise<PublicCatalog> {
  await requireRole(["admin"], "/admin/ramos");
  return readCatalog(await createClient(), true);
}

export interface PersistentCourseRequest {
  id: string; name: string; code: string | null; kind: "regular" | "elective";
  curricular_semester: number | null; elective_area_id: string | null; justification: string;
  status: "pending" | "approved" | "rejected"; created_at: string;
  review_notes: string | null; reviewed_at: string | null; resulting_course_id: string | null;
}

export async function listCourseRequests(own = true, options: { status?: RequestStatusFilter; page?: number } = {}): Promise<PersistentCourseRequest[]> {
  const account = own ? await requireAccount("/gestion/asignaturas") : await requireRole(["moderator", "admin"], "/moderacion");
  const client = await createClient();
  let query = client.from("course_creation_requests").select("id,name,code,kind,curricular_semester,elective_area_id,justification,status,created_at,review_notes,reviewed_at,resulting_course_id").order("created_at", { ascending: false }).order("id");
  if (own) query = query.eq("requested_by", account.id);
  const status = options.status ?? (own ? "all" : "pending");
  if (status !== "all") query = query.eq("status", status);
  const page = Number.isSafeInteger(options.page) && options.page! > 0 && options.page! <= 999999 ? options.page! : 1;
  const offset = (page - 1) * requestPageSize;
  const result = await query.range(offset, offset + requestPageSize - 1);
  if (result.error || !result.data) throw new Error("No se pudieron consultar las solicitudes. Vuelve a intentarlo.");
  return result.data as PersistentCourseRequest[];
}
