import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAuthForm, type AuthActionState, type AuthFormKind } from "../../domain/auth.ts";

export function authError(code?: string): string {
  if (code === "invalid_credentials") return "El correo o la contraseña no son correctos.";
  if (code === "email_not_confirmed") return "Confirma tu correo antes de iniciar sesión.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  if (code === "same_password") return "Elige una contraseña diferente a la actual.";
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid") return "Vuelve a iniciar sesión antes de cambiar la contraseña o solicita un nuevo enlace de recuperación.";
  if (code === "weak_password") return "La contraseña no cumple los requisitos de seguridad.";
  return "No pudimos completar la operación. Inténtalo de nuevo más tarde.";
}

export async function runAuthFlow(client: SupabaseClient, kind: Exclude<AuthFormKind, "profile"> | "logout", values: Record<string, string>, site: string): Promise<AuthActionState> {
  if (kind !== "logout") {
    const fieldErrors = validateAuthForm(kind, values);
    if (Object.keys(fieldErrors).length) return { error: "Revisa los campos indicados.", fieldErrors };
  }
  try {
    let result;
    switch (kind) {
      case "register":
        result = await client.auth.signUp({ email: values.email, password: values.password, options: { emailRedirectTo: `${site}/auth/confirm` } });
        break;
      case "login": result = await client.auth.signInWithPassword({ email: values.email, password: values.password }); break;
      case "recover": result = await client.auth.resetPasswordForEmail(values.email, { redirectTo: `${site}/auth/confirm?next=/restablecer-contrasena` }); break;
      case "password": result = await client.auth.updateUser({ password: values.password }); break;
      case "logout": result = await client.auth.signOut({ scope: "local" }); break;
    }
    if (result.error) return { error: authError(result.error.code) };
    return { success: kind === "register" ? "Si el correo puede registrarse, recibirás un enlace para confirmarlo. Revisa también spam." : kind === "recover" ? "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña." : kind === "password" ? "Contraseña actualizada." : "Operación completada." };
  } catch { return { error: authError() }; }
}

export async function confirmEmail(client: SupabaseClient, tokenHash: string | null, type: string | null): Promise<string | null> {
  if (!tokenHash || tokenHash.length > 1024 || !/^[a-zA-Z0-9_-]+$/.test(tokenHash) || (type !== "signup" && type !== "email" && type !== "recovery")) return null;
  try {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return null;
    return type === "recovery" ? "/restablecer-contrasena" : "/mi-cuenta";
  } catch { return null; }
}

export async function confirmAuthCallback(client: SupabaseClient, params: URLSearchParams): Promise<string | null> {
  if (params.has("error") || params.has("error_code") || ["token_hash", "type", "code", "next"].some(key => params.getAll(key).length > 1)) return null;
  if (params.has("code")) {
    // ConfirmationURL already consumes the OTP at Auth; only exchange its PKCE code.
    if (params.has("token_hash") || params.has("type")) return null;
    const code = params.get("code");
    if (!code || !/^[a-zA-Z0-9_-]{1,2048}$/.test(code)) return null;
    try {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return null;
      return params.get("next") === "/restablecer-contrasena" ? "/restablecer-contrasena" : "/mi-cuenta";
    } catch { return null; }
  }
  return confirmEmail(client, params.get("token_hash"), params.get("type"));
}
