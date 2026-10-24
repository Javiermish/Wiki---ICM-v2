import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CourseRequestForm, CourseRequestList } from "@/components/courses/course-requests";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { requireAccount } from "@/lib/auth/session";
import { getPublicCatalog, listCourseRequests } from "@/lib/catalog/persistent";
import { requestPagination } from "@/lib/catalog/request-pagination";
import type { SearchParameters } from "@/lib/catalog/filters";

export const metadata: Metadata = { title: "Solicitar asignatura · Wiki ICM", robots: { index: false, follow: false } };

export default function CourseManagementPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  return <Suspense fallback={<main id="contenido" className="page-container flex-1 py-10"><p role="status">Cargando solicitudes…</p></main>}><RequestsContent searchParams={searchParams} /></Suspense>;
}

async function RequestsContent({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const account = await requireAccount("/gestion/asignaturas");
  const pagination = requestPagination(await searchParams);
  let data;
  try { data = await Promise.all([getPublicCatalog(), listCourseRequests(true, pagination)]); } catch {
    return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><h1 className="text-3xl font-semibold">Solicitar asignatura</h1><p role="alert" className="mt-5 text-destructive">No se pudieron cargar tus solicitudes o el catálogo. Recarga para reintentar; no se muestran datos de demostración.</p></main>;
  }
  const [catalog, requests] = data;
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 space-y-8 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Solicitar asignatura" }]} />
    <header className="max-w-3xl"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Solicitar asignatura</h1><p className="mt-3 text-muted-foreground">Propón un ramo que falte en la biblioteca y explica por qué debe incorporarse. Tu solicitud se guarda en tu cuenta; solo una revisión humana puede aprobarla y crear el ramo.</p>{account.role === "admin" ? <Link href="/admin/ramos" className="text-link mt-3 inline-flex min-h-11 items-center">Administrar el catálogo</Link> : null}</header>
    <CourseRequestForm catalog={catalog} />
    <section aria-labelledby="own-requests-title" className="space-y-5"><h2 id="own-requests-title" className="text-2xl font-semibold">Mis solicitudes</h2><CourseRequestList key={`${pagination.status}-${pagination.page}`} requests={requests} areas={catalog.electiveAreas} page={pagination.page} statusFilter={pagination.status} /></section>
  </main>;
}
