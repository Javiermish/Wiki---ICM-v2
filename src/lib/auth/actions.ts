"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeNext, validateAuthForm, type AuthActionState, type AuthFormKind } from "@/domain/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireAccount, requireRole, getAccountResult } from "./session";
import { runAuthFlow } from "./flows";

function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of ["email", "password", "passwordConfirm", "displayName"]) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? (field === "email" || field === "displayName" ? value.trim() : value) : "";
  }
  return values;
}

function siteUrl(): string | null {
  const value = process.env.SITE_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) ? url.origin : null;
  } catch { return null; }
}

async function execute(kind: Exclude<AuthFormKind, "profile">, form: FormData): Promise<AuthActionState> {
  const values = formValues(form);
  const fieldErrors = validateAuthForm(kind, values);
  if (Object.keys(fieldErrors).length) return { error: "Revisa los campos indicados.", fieldErrors };
  if (!isSupabaseConfigured()) return { error: "La autenticación aún no está configurada. El catálogo sigue disponible sin cuenta." };
  const site = siteUrl();
  if ((kind === "register" || kind === "recover") && !site) return { error: "Falta configurar la URL del sitio para enviar enlaces de correo seguros." };
  return runAuthFlow(await createClient(), kind, values, site ?? "");
}

export async function registerAction(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  return execute("register", form);
}

export async function loginAction(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  const result = await execute("login", form);
  if (result.error) return result;
  const account = await getAccountResult();
  if (account.status === "unverified") return { error: "Confirma tu correo antes de iniciar sesión." };
  if (account.status === "configuration_error") return { error: "La autenticación aún no está configurada." };
  if (account.status === "profile_error") return { error: "Tu correo está verificado y el inicio de sesión fue correcto, pero no pudimos cargar tu perfil y rol. La base de datos de cuentas puede no estar configurada o estar incompleta. Contacta con administración para revisar las migraciones y permisos." };
  if (account.status === "unauthenticated") return { error: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  if (account.status === "unavailable") return { error: "No pudimos comprobar tu cuenta en este momento. Inténtalo de nuevo más tarde." };
  revalidatePath("/", "layout");
  redirect(safeNext(form.get("next")));
}

export async function recoverPasswordAction(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  return execute("recover", form);
}

export async function updatePasswordAction(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  await requireAccount("/restablecer-contrasena");
  return execute("password", form);
}

export async function updateProfileAction(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  const account = await requireAccount();
  const values = formValues(form);
  const fieldErrors = validateAuthForm("profile", values);
  if (Object.keys(fieldErrors).length) return { error: "Revisa los campos indicados.", fieldErrors };
  try {
    const { data, error } = await (await createClient()).from("profiles").update({ display_name: values.displayName }).eq("id", account.id).select("id").single();
    if (error || !data) return { error: "No pudimos actualizar tu perfil. Inténtalo de nuevo." };
  } catch { return { error: "No pudimos conectar para actualizar tu perfil." }; }
  revalidatePath("/mi-cuenta");
  return { success: "Perfil actualizado." };
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const result = await runAuthFlow(await createClient(), "logout", {}, "");
    if (result.error) redirect("/mi-cuenta?error=logout");
  }
  revalidatePath("/", "layout");
  redirect("/login?logout=1");
}

export async function setModeratorAction(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  await requireRole(["admin"], "/admin/usuarios");
  const target = form.get("targetUserId");
  const enabled = form.get("enabled");
  const reason = form.get("reason");
  if (typeof target !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target) || !["true", "false"].includes(String(enabled)) || typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) return { error: "Selecciona una cuenta válida e indica un motivo de 5 a 500 caracteres." };
  try {
    const { error } = await (await createClient()).rpc("set_moderator", { target_user_id: target, enabled: enabled === "true", reason: reason.trim() });
    if (error) return { error: "No se pudo cambiar el rol. Comprueba tus permisos y que la cuenta tenga correo verificado y no sea administradora." };
  } catch { return { error: "No pudimos conectar para cambiar el rol." }; }
  revalidatePath("/admin/usuarios");
  return { success: "Rol actualizado y cambio registrado en el historial." };
}
