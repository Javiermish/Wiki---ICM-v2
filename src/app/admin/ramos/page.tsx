import type { Metadata } from "next";
import { Suspense } from "react";
import { CourseCatalogProvider } from "@/components/catalog/course-catalog-provider";
import { CourseManager } from "@/components/courses/course-manager";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { requireRole } from "@/lib/auth/session";
import { getAdministrationCatalog } from "@/lib/catalog/persistent";

export const metadata: Metadata = { title: "Administrar ramos · Wiki ICM", robots: { index: false, follow: false } };

export default function AdministrationPage() {
  return <Suspense fallback={<main id="contenido" className="page-container flex-1 py-10"><p role="status">Cargando administración…</p></main>}><AdministrationContent /></Suspense>;
}

async function AdministrationContent() {
  await requireRole(["admin"], "/admin/ramos");
  let catalog;
  try { catalog = await getAdministrationCatalog(); } catch {
    return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><h1 className="text-3xl font-semibold">Administrar ramos</h1><p role="alert" className="mt-5 text-destructive">No se pudo cargar el catálogo. Recarga la página para reintentar; no se sustituyen los datos por ejemplos.</p></main>;
  }
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Mi cuenta", href: "/mi-cuenta" }, { label: "Administrar ramos" }]} />
    <header className="mb-8 max-w-3xl"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Administrar ramos</h1><p className="mt-3 text-muted-foreground">Administración persistente del catálogo, incluidos ramos archivados. Los permisos se verifican en servidor. Esta biblioteca no acredita una malla oficial.</p></header>
    <CourseCatalogProvider initialCatalog={catalog}><CourseManager /></CourseCatalogProvider>
  </main>;
}
