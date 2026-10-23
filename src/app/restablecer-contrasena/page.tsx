import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { requireAccount } from "@/lib/auth/session";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Restablecer contraseña · Wiki ICM", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Verificando acceso…</p></main>}><ResetPasswordContent /></Suspense>;
}

async function ResetPasswordContent() {
  await requireAccount("/restablecer-contrasena");
  return <AuthShell title="Restablecer contraseña" description="Elige una nueva contraseña para tu cuenta."><AuthForm mode="password" /></AuthShell>;
}
