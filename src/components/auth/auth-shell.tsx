import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const configured = isSupabaseConfigured();
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: title }]} />
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
      {!configured && <p role="status" className="mt-5 rounded-xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">Autenticación no disponible: falta configurar Supabase. Los formularios están deshabilitados; no se crea ninguna sesión de demostración.</p>}
      <fieldset disabled={!configured} className="mt-6 min-w-0 space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
      <p className="mt-5 text-sm text-muted-foreground"><Link href="/" className="underline underline-offset-4">Explorar sin iniciar sesión</Link>. Los archivos son muestras de demostración y los favoritos siguen siendo locales.</p>
    </div>
  </main>;
}
