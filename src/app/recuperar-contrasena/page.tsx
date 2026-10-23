import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Recuperar contraseña · Wiki ICM", robots: { index: false, follow: false } };

export default function RecoverPasswordPage() {
  return <AuthShell title="Recuperar contraseña" description="Solicita un enlace para restablecer tu contraseña. Por privacidad, la respuesta no confirma si un correo tiene una cuenta.">
    <AuthForm mode="recover" />
    <p className="text-sm"><Link href="/login" className="underline underline-offset-4">Volver a iniciar sesión</Link></p>
  </AuthShell>;
}
