"use client";

import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { CourseFilters } from "@/components/catalog/course-filters";
import { MaterialCard } from "@/components/catalog/material-card";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import type { CatalogFilters } from "@/domain/catalog";
import { categoryLabels, courseClassification, courseFacets, courseMaterials, courseParentBreadcrumb } from "@/lib/catalog/query";
import { courseHref } from "@/lib/catalog/course-filters";

export function CourseContent({ slug, filters, errors }: { slug: string; filters: CatalogFilters; errors: string[] }) {
  const { catalog } = useCourseCatalog();
  const course = catalog.courses.find((entry) => entry.slug === slug);
  if (!course) return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Ramo no disponible" }]} />
      <EmptyState title="Ramo no disponible">
        <p>El ramo no está en el catálogo activo o no pudo consultarse. Recarga la página para consultar su estado actual.</p>
        <Link href="/" className="text-link mt-3 inline-flex min-h-11 items-center rounded font-semibold">Volver al catálogo</Link>
      </EmptyState>
    </main>
  );
  const category = filters.category ?? "listado";
  const materials = errors.length ? [] : courseMaterials(catalog, course.id, filters);
  const facets = courseFacets(catalog, course.id, category);
  const clearHref = courseHref(course.slug, { category });
  return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, courseParentBreadcrumb(course, catalog.electiveAreas), { label: course.name }]} />
      <Badge>Catálogo académico</Badge>
      {course.code ? <p className="mt-4 text-sm font-medium text-muted-foreground">Código: {course.code}</p> : null}
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{course.name}</h1>
      <p className="mt-3 font-medium">{courseClassification(course, catalog.electiveAreas)}</p>
      <div className="mt-4"><FavoriteButton courseId={course.id} courseName={course.name} /></div>
      {course.description ? <p className="mt-2 max-w-2xl text-muted-foreground">{course.description}</p> : null}
      <p className="mt-2 max-w-2xl text-muted-foreground">Los archivos disponibles son muestras locales. La carga inicial del catálogo es ilustrativa, no la malla oficial de la UdeC. El período académico de cada documento es independiente del semestre curricular.</p>
      {course.status === "archived" ? <div className="mt-4 rounded-xl border border-border bg-muted p-4 text-sm"><p><strong>Ramo archivado.</strong> Sus materiales aprobados siguen disponibles, pero no se preparan nuevos aportes para este ramo.</p><Link href="/gestion/asignaturas" className="text-link mt-2 inline-flex min-h-11 items-center rounded font-semibold">Gestionar ramos · demo local</Link></div> : <Link href={`/aportar?ramo=${encodeURIComponent(course.slug)}`} className="text-link mt-3 inline-flex min-h-11 items-center rounded text-sm font-semibold">Preparar un aporte para este ramo · demo local</Link>}
      <CourseFilters slug={course.slug} filters={filters} years={facets.years} numbers={facets.numbers} />
      <section aria-labelledby="course-materials-heading">
        <h2 id="course-materials-heading" className="mb-3 text-2xl font-semibold tracking-tight">{categoryLabels[category]}</h2>
        {errors.length ? (
          <div role="alert" className="rounded-xl border border-destructive bg-card p-6">
            <h3 className="font-semibold text-destructive">Revisa los filtros</h3>
            <ul className="mt-2 list-inside list-disc text-sm">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            <p className="mt-3 text-sm text-muted-foreground">No se muestran materiales con criterios inválidos. Corrige los filtros o límpialos para continuar.</p>
            <Link href={clearHref} className="text-link mt-2 inline-flex min-h-11 items-center rounded text-sm font-semibold">Limpiar filtros</Link>
          </div>
        ) : <>
          <p role="status" aria-live="polite" aria-atomic="true" className="mb-5 text-sm text-muted-foreground">{materials.length} {materials.length === 1 ? "material ficticio encontrado" : "materiales ficticios encontrados"}. Solo ejemplos aprobados. Abre una ficha para consultar los archivos de demostración disponibles.</p>
          {materials.length ? <ul className="space-y-3">{materials.map((material) => <li key={material.id}><MaterialCard material={material} courseFilters={filters} /></li>)}</ul> : (
            <EmptyState title={facets.count ? "No encontramos materiales con estos filtros" : "Aún no hay ejemplos en esta categoría"}>
              <p>{facets.count ? "Prueba con otro período académico o combina menos filtros." : "Puedes explorar otra categoría. La ausencia de ejemplos no significa que el ramo no tenga material en la realidad."}</p>
              <Link href={clearHref} className="text-link mt-3 inline-flex min-h-11 items-center rounded font-semibold">Limpiar filtros de esta categoría</Link>
            </EmptyState>
          )}
        </>}
      </section>
    </main>
  );
}
