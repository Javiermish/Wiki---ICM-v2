import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CourseFilters } from "@/components/catalog/course-filters";
import { MaterialCard } from "@/components/catalog/material-card";
import { demoCatalog } from "@/fixtures/catalog";
import { categoryLabels, courseFacets, courseMaterials } from "@/lib/catalog/query";
import { courseHref, parseCourseFilters } from "@/lib/catalog/course-filters";
import type { SearchParameters } from "@/lib/catalog/filters";
import CourseLoading from "./loading";

type CourseProps = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParameters> };

export const unstable_paramMatching = { slug: "not-found" } as const;
export function generateStaticParams() {
  return demoCatalog.courses.map((course) => ({ slug: course.slug }));
}

export default function CoursePage(props: CourseProps) {
  return <Suspense fallback={<CourseLoading />}><CourseContent {...props} /></Suspense>;
}

async function CourseContent({ params, searchParams }: CourseProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const course = demoCatalog.courses.find((entry) => entry.slug === slug);
  if (!course) notFound();
  const { filters, errors } = parseCourseFilters(query);
  const category = filters.category ?? "listado";
  const materials = errors.length ? [] : courseMaterials(demoCatalog, course.id, filters);
  const facets = courseFacets(demoCatalog, course.id, category);
  const clearHref = courseHref(course.slug, { category });

  return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: `Semestre curricular ${course.curricularSemester}`, href: `/semestres/${course.curricularSemester}` }, { label: course.name }]} />
      <Badge>Ramo de demostración</Badge>
      {course.code ? <p className="mt-4 text-sm font-medium text-muted-foreground">Código de ejemplo: {course.code}</p> : null}
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{course.name}</h1>
      <p className="mt-3 font-medium">Semestre curricular {course.curricularSemester}</p>
      <p className="mt-2 max-w-2xl text-muted-foreground">Ramo y materiales ficticios: no representan la malla oficial de la UdeC. El período académico de cada documento es independiente del semestre curricular.</p>
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
