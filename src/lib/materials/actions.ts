"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function reviewMaterialAction(id: string, decision: "approved" | "rejected", notes: string): Promise<void> {
  await requireRole(["moderator", "admin"], "/moderacion");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
    || !["approved", "rejected"].includes(decision) || typeof notes !== "string" || !notes.trim() || notes.trim().length > 1000) throw new Error("Elige una decisión y escribe observaciones de entre 1 y 1000 caracteres.");
  const { error } = await (await createClient()).rpc("review_material", { material_id: id, decision, notes: notes.trim() });
  if (error?.code === "55000") throw new Error("Este aporte ya fue resuelto o no está listo. Recarga para consultar su estado.");
  if (error) throw new Error("No se pudo guardar la revisión. No se confirmó ninguna publicación.");
  revalidatePath("/", "layout");
}
