import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ModerationWorkspace } from "@/components/moderation/moderation-workspace";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Moderación · Demo pública · Wiki ICM", robots: { index: false, follow: false } };

export default function ModerationPage() {
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Moderación · demo pública" }]} />
    <header className="mb-8 max-w-3xl">
      <Badge>Demostración pública · sin login</Badge>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Moderación</h1>
      <p className="mt-3 text-muted-foreground">Practica la revisión de materiales sintéticos, solicitudes de ramos y reportes locales.</p>
      <div className="mt-5 space-y-2 rounded-xl border border-border bg-secondary p-5 text-sm text-secondary-foreground">
        <p className="font-semibold">Demo pública sin backend, autenticación ni permisos efectivos. No es una administración segura.</p>
        <p>Todo el historial es ficticio o local. No hay aportes privados ni revisiones reales; no introduzcas datos personales. Las decisiones y reportes solo viven en memoria de esta pestaña, se conservan al navegar y se pierden al recargar o cerrar.</p>
        <p>Aprobar no publica materiales ni crea ramos. Rechazar o resolver no despublica documentos. El catálogo público permanece aislado de estas colas.</p>
      </div>
    </header>
    <ModerationWorkspace />
  </main>;
}
