import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireAccount } from "@/lib/auth/session";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Mi cuenta · Wiki ICM", robots: { index: false, follow: false } };

export default function AccountPage(props: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Cargando cuenta…</p></main>}><AccountContent {...props} /></Suspense>;
}

async function AccountContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const account = await requireAccount("/mi-cuenta");
  const params = await searchParams;
  return <AuthShell title="Mi cuenta" description="Esta es tu cuenta real. El catálogo y las solicitudes son persistentes; los archivos siguen siendo muestras y los favoritos son locales.">
    {params.error === "forbidden" && <p role="alert" className="text-sm text-destructive">Tu cuenta no tiene permisos para acceder a esa sección.</p>}
    {params.error === "logout" && <p role="alert" className="text-sm text-destructive">No pudimos cerrar la sesión. Comprueba tu conexión e inténtalo de nuevo.</p>}
    <dl className="space-y-2 text-sm"><div><dt className="font-medium">Correo verificado</dt><dd className="break-all">{account.email}</dd></div><div><dt className="font-medium">Rol</dt><dd>{account.role === "admin" ? "Administrador" : account.role === "moderator" ? "Moderador" : "Estudiante"}</dd></div></dl>
    <AuthForm mode="profile" displayName={account.displayName ?? ""} />
    <nav aria-label="Opciones de cuenta" className="flex flex-wrap gap-4 text-sm">
      <Link href="/restablecer-contrasena" className="underline underline-offset-4">Cambiar contraseña</Link>
      <Link href="/mis-aportes" className="underline underline-offset-4">Mis aportes</Link>
      <Link href="/favoritos" className="underline underline-offset-4">Favoritos locales · demo</Link>
      {(account.role === "admin" || account.role === "moderator") && <Link href="/moderacion" className="underline underline-offset-4">Moderación · demo</Link>}
      {account.role === "admin" && <Link href="/admin/usuarios" className="underline underline-offset-4">Administrar usuarios</Link>}
    </nav>
    <p className="text-sm text-muted-foreground">Los favoritos se guardan únicamente en este navegador. No se sincronizan con esta cuenta ni entre dispositivos.</p>
    <LogoutButton />
  </AuthShell>;
}
