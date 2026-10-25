import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ModerationWorkspace } from "@/components/moderation/moderation-workspace";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { Suspense } from "react";
import { CourseRequestList } from "@/components/courses/course-requests";
import { getPublicCatalog, listCourseRequests } from "@/lib/catalog/persistent";
import { requestPagination } from "@/lib/catalog/request-pagination";
import type { SearchParameters } from "@/lib/catalog/filters";
import { getReviewMaterials } from "@/lib/materials/persistent";
import { PersistentMaterialList } from "@/components/moderation/persistent-materials";

export const metadata: Metadata = { title: "Moderación · Wiki ICM", robots: { index: false, follow: false } };

export default function ModerationPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Verificando permisos…</p></main>}><ModerationContent searchParams={searchParams} /></Suspense>;
}

async function ModerationContent({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await requireRole(["moderator", "admin"], "/moderacion");
  const parameters = await searchParams;
  const pagination = requestPagination(parameters, true);
  const materialPage = requestPagination({ pagina: parameters.materialesPagina }).page;
  let requestData;
  let materials;
  try { materials = await getReviewMaterials(materialPage); } catch { materials = null; }
  try { requestData = await Promise.all([getPublicCatalog(), listCourseRequests(false, pagination)]); } catch { requestData = null; }
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Moderación" }]} />
    <header className="mb-8 max-w-3xl">
      <Badge>Revisión real · DEMO separada</Badge>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Moderación</h1>
      <p className="mt-3 text-muted-foreground">Acceso con sesión y rol verificados en servidor. Los aportes y solicitudes de las secciones reales se revisan y guardan en servidor. El espacio DEMO inferior conserva ejercicios locales independientes.</p>
    </header>
    <section id="materiales-reales" aria-labelledby="persistent-materials-title" className="mb-12 space-y-5"><h2 id="persistent-materials-title" className="text-2xl font-semibold">Materiales · revisión real</h2><p className="max-w-3xl text-sm text-muted-foreground">Solo se muestran aportes pendientes con archivo listo. Revisa su contenido antes de aprobar su acceso público. Toda decisión requiere motivo y confirmación.</p>{materials ? <PersistentMaterialList materials={materials} review page={materialPage} /> : <p role="alert" className="rounded-xl border border-destructive p-5 text-sm text-destructive">No se pudieron cargar los materiales. Comprueba la configuración y recarga para reintentar; no se muestran aportes ficticios.</p>}</section>
    <section id="solicitudes" aria-labelledby="persistent-requests-title" className="mb-12 space-y-5"><h2 id="persistent-requests-title" className="text-2xl font-semibold">Solicitudes de ramos · revisión real</h2><p className="max-w-3xl text-sm text-muted-foreground">Aprobar crea un ramo en el catálogo público. Rechazar guarda el motivo para la persona solicitante. Ambas decisiones quedan registradas en servidor.</p>{requestData ? <CourseRequestList key={`${pagination.status}-${pagination.page}`} requests={requestData[1]} areas={requestData[0].electiveAreas} page={pagination.page} statusFilter={pagination.status} review /> : <p role="alert" className="rounded-xl border border-destructive p-5 text-sm text-destructive">No se pudieron cargar las solicitudes. Recarga para reintentar; no se muestran solicitudes ficticias.</p>}</section>
    <section aria-labelledby="demo-workspace-title" className="space-y-6"><div className="rounded-xl border border-border bg-secondary p-5 text-sm text-secondary-foreground"><h2 id="demo-workspace-title" className="text-xl font-semibold">Materiales y reportes · DEMO local</h2><p className="mt-2">En este espacio DEMO no hay moderación ni publicación real de archivos: son registros sintéticos, no aportes privados. Estas decisiones no publican ni retiran archivos; se pierden al recargar. No introduzcas datos personales. Este espacio no modifica las solicitudes reales de arriba.</p></div><ModerationWorkspace showCourseRequests={false} /></section>
  </main>;
}
