export type Role = "student" | "moderator" | "admin";
export type Account = { id: string; email: string; displayName: string; role: Role };
export type AuthActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> };
export type AuthFormKind = "register" | "login" | "recover" | "password" | "profile";

export function isRole(value: unknown): value is Role {
  return value === "student" || value === "moderator" || value === "admin";
}

// An allowlist avoids URL-parser disagreements, encoded separators and auth loops.
export function safeNext(value: unknown): string {
  return typeof value === "string" && ["/mi-cuenta", "/mis-aportes", "/moderacion", "/admin/usuarios", "/favoritos", "/restablecer-contrasena"].includes(value) ? value : "/mi-cuenta";
}

export function validateAuthForm(kind: AuthFormKind, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (["register", "login", "recover"].includes(kind) && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email ?? "") || values.email.length > 254)) errors.email = "Introduce un correo electrónico válido.";
  if (["register", "login", "password"].includes(kind)) {
    const min = kind === "login" ? 1 : 12;
    if (!values.password || values.password.length < min || values.password.length > 128) errors.password = `La contraseña debe tener entre ${min} y 128 caracteres.`;
  }
  if (["register", "password"].includes(kind) && values.password !== values.passwordConfirm) errors.passwordConfirm = "Las contraseñas no coinciden.";
  if (["profile", "register"].includes(kind) && (values.displayName ?? "").trim().length > 80) errors.displayName = "Usa como máximo 80 caracteres.";
  return errors;
}
