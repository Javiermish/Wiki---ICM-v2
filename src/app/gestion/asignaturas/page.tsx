import type { Metadata } from "next";
import { CourseManager } from "@/components/courses/course-manager";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Gestión de asignaturas · Demo pública · Wiki ICM",
  robots: { index: false, follow: false },
};

export default function CourseManagementPage() {
  return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Gestión de asignaturas · demo" }]} />
    <header className="mb-8 max-w-3xl">
      <Badge>Demostración pública · sin login</Badge>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Gestión de asignaturas</h1>
      <p className="mt-3 text-muted-foreground">Explora, crea y edita ramos de ejemplo. Este catálogo es ficticio y no representa la malla oficial.</p>
      <div className="mt-5 space-y-2 rounded-xl border border-border bg-secondary p-5 text-sm text-secondary-foreground">
        <p className="font-semibold">Ruta pública y no segura: no es una administración real.</p>
        <p>No requiere iniciar sesión. Los cambios solo viven en memoria en esta pestaña durante la navegación; al recargar o cerrarla se pierden. No afectan a otros usuarios ni modifican documentos.</p>
        <p>Próximamente: solicitudes reales para usuarios registrados, con revisión humana. Esta demo no envía solicitudes ni simula una revisión real.</p>
      </div>
    </header>
    <CourseManager />
  </main>;
}
