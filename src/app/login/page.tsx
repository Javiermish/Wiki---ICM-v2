import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { Suspense } from "react";
import { getAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Iniciar sesión · Wiki ICM", robots: { index: false, follow: false } };

export default function LoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Cargando acceso…</p></main>}><LoginContent {...props} /></Suspense>;
}

async function LoginContent({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const account = params.error === "confirmation" ? await getAccount() : null;
  return <AuthShell title="Iniciar sesión" description="Accede con tu correo electrónico verificado. Puedes explorar materiales sin una cuenta.">
    {params.error === "confirmation" && (account ? <div role="alert" className="space-y-2 text-sm">
      <p>Tu sesión ya está autenticada con correo verificado. Este enlace no se ha validado: puede haber caducado o haberse utilizado. Puedes continuar con tu sesión actual.</p>
      <Link href="/mi-cuenta" className="text-link inline-flex min-h-11 items-center">Continuar a mi cuenta</Link>
    </div> : <p role="alert" className="text-sm text-destructive">No se pudo confirmar el enlace: puede ser inválido, haber caducado o haberse utilizado. Si ya confirmaste tu correo, inicia sesión.</p>)}
    {params.error === "profile" && <p role="alert" className="text-sm text-destructive">No pudimos cargar tu perfil y rol. Administración debe revisar las migraciones, los datos de tu cuenta y los permisos de la base de datos. Confirmar el correo de nuevo no resuelve este problema.</p>}
    {params.error === "configuration" && <p role="alert" className="text-sm text-destructive">La autenticación aún no está configurada. El catálogo público sigue disponible.</p>}
    {params.error === "session" && <p role="alert" className="text-sm text-destructive">No pudimos comprobar tu cuenta en este momento. Inténtalo de nuevo más tarde.</p>}
    {params.error === "unverified" && <p role="alert" className="text-sm text-destructive">Confirma tu correo antes de iniciar sesión.</p>}
    <AuthForm mode="login" next={typeof params.next === "string" ? params.next : "/mi-cuenta"} />
    <nav aria-label="Opciones de acceso" className="flex flex-wrap gap-4 text-sm"><Link href="/registro" className="underline underline-offset-4">Crear cuenta</Link><Link href="/recuperar-contrasena" className="underline underline-offset-4">Olvidé mi contraseña</Link></nav>
  </AuthShell>;
}
