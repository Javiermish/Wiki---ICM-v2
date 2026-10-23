import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireAccount } from "@/lib/auth/session";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Mis aportes · Wiki ICM", robots: { index: false, follow: false } };

export default function ContributionsPage() {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Verificando acceso…</p></main>}><ContributionsContent /></Suspense>;
}

async function ContributionsContent() {
  await requireAccount("/mis-aportes");
  return <AuthShell title="Mis aportes" description="Próximamente: consulta del estado de tus aportes reales.">
    <p className="text-sm text-muted-foreground">Todavía no hay envío, almacenamiento ni revisión real de archivos. El formulario de aportes es una demostración local; sus simulaciones no se guardan en tu cuenta ni crean una cola de revisión.</p>
    <Link href="/aportar" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Ver formulario de demostración</Link>
  </AuthShell>;
}
