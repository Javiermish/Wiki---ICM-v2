"use server";

import { revalidatePath } from "next/cache";
import type { Course } from "@/domain/catalog";
import { validateCourseInput, type CourseInput } from "@/domain/course-management";
import { requireAccount, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { courseColumns, getAdministrationCatalog, getPublicCatalog } from "./persistent";
import { courseFromRow, courseToRow } from "./rows";

function databaseError(code?: string): never {
  if (code === "23505") throw new Error("Ya existe un ramo con ese nombre o código, posiblemente archivado.");
  if (code === "42501") throw new Error("No tienes permisos para realizar esta operación.");
  throw new Error("No se pudo guardar en PostgreSQL. Revisa los datos y vuelve a intentarlo.");
}

function refreshCatalog() {
  revalidatePath("/", "layout");
}

export async function createCourseAction(input: CourseInput): Promise<Course> {
  await requireRole(["admin"], "/admin/ramos");
  const catalog = await getAdministrationCatalog();
  const validation = validateCourseInput(input, catalog);
  if (!validation.value) throw new Error(Object.values(validation.errors).join(" "));
  const client = await createClient();
  const { data, error } = await client.from("courses").insert({ ...courseToRow(validation.value), curriculum_id: "plan-ilustrativo" }).select(courseColumns).single();
  if (error || !data) databaseError(error?.code);
  refreshCatalog();
  return courseFromRow(data);
}

export async function updateCourseAction(id: string, input: CourseInput, expectedVersion?: number): Promise<Course> {
  await requireRole(["admin"], "/admin/ramos");
  const catalog = await getAdministrationCatalog();
  const course = catalog.courses.find((item) => item.id === id);
  if (!course) throw new Error("Ramo no encontrado.");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== course.version) throw new Error("El ramo cambió desde que lo abriste. Recarga antes de editar.");
  const validation = validateCourseInput(input, catalog, id);
  if (!validation.value) throw new Error(Object.values(validation.errors).join(" "));
  const client = await createClient();
  const { data, error } = await client.from("courses").update(courseToRow(validation.value)).eq("id", id).eq("version", expectedVersion).select(courseColumns).maybeSingle();
  if (error) databaseError(error.code);
  if (!data) throw new Error("Otro administrador cambió el ramo. Recarga antes de editar.");
  refreshCatalog();
  return courseFromRow(data);
}

export async function setCourseArchivedAction(id: string, archived: boolean, expectedVersion?: number): Promise<Course> {
  await requireRole(["admin"], "/admin/ramos");
  if (typeof id !== "string" || typeof archived !== "boolean" || !Number.isSafeInteger(expectedVersion)) throw new Error("Estado o versión de ramo no válidos.");
  const client = await createClient();
  const { data, error } = await client.from("courses").update({ status: archived ? "archived" : "active" }).eq("id", id).eq("version", expectedVersion).select(courseColumns).maybeSingle();
  if (error) databaseError(error.code);
  if (!data) throw new Error("El ramo ya no está disponible o cambió. Recarga e inténtalo otra vez.");
  refreshCatalog();
  return courseFromRow(data);
}

export async function submitCourseRequestAction(input: CourseInput, justification: string): Promise<void> {
  await requireAccount("/gestion/asignaturas");
  if (typeof justification !== "string" || justification.trim().length < 10 || justification.trim().length > 2000) throw new Error("Explica la justificación con entre 10 y 2000 caracteres.");
  const validation = validateCourseInput(input, await getPublicCatalog());
  if (!validation.value) throw new Error(Object.values(validation.errors).join(" "));
  const client = await createClient();
  const { error } = await client.from("course_creation_requests").insert({ ...courseToRow(validation.value), curriculum_id: "plan-ilustrativo", justification: justification.trim() });
  if (error) databaseError(error.code);
  refreshCatalog();
}

export async function reviewCourseRequestAction(id: string, decision: "approved" | "rejected", notes: string): Promise<void> {
  await requireRole(["moderator", "admin"], "/moderacion");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !["approved", "rejected"].includes(decision) || typeof notes !== "string" || notes.trim().length < 1 || notes.trim().length > 1000) throw new Error("Elige una decisión e indica un motivo de entre 1 y 1000 caracteres.");
  const client = await createClient();
  const { error } = await client.rpc("review_course_request", { request_id: id, decision, notes: notes.trim() });
  if (error?.code === "55000") throw new Error("Esta solicitud ya fue resuelta. Recarga para consultar la decisión.");
  if (error) databaseError(error.code);
  refreshCatalog();
}
