import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Crear cuenta · Wiki ICM", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return <AuthShell title="Crear cuenta" description="Puedes registrarte con cualquier correo electrónico. Debes verificarlo mediante el enlace que recibirás antes de iniciar sesión.">
    <AuthForm mode="register" />
    <p className="text-sm"><Link href="/login" className="underline underline-offset-4">Ya tengo una cuenta</Link></p>
  </AuthShell>;
}
