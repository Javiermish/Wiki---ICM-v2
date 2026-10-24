"use client";

import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { CourseCard } from "@/components/catalog/course-card";
import { LocalCourseSearch } from "@/components/catalog/local-course-search";
import { SemesterNavigation } from "@/components/catalog/semester-navigation";
import type { CatalogFilters } from "@/domain/catalog";
import { catalogSemesters, courseMaterials, semesterCourses } from "@/lib/catalog/query";

export function SemesterContent({ semester, filters, errors }: { semester: number; filters: CatalogFilters; errors: string[] }) {
  const { catalog } = useCourseCatalog();
  const courses = errors.length ? [] : semesterCourses(catalog, semester, filters.q);
  return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: `Semestre curricular ${semester}` }]} />
      <Badge>Catálogo académico</Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Semestre curricular {semester}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Ramos y códigos ficticios para explorar el prototipo. Esta selección no representa ni valida la malla oficial de la UdeC.</p>
      <SemesterNavigation semesters={catalogSemesters(catalog)} current={semester} />
      <LocalCourseSearch semester={semester} query={filters.q} />
      <section aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="mb-3 text-2xl font-semibold tracking-tight">Ramos de ejemplo</h2>
        {errors.length ? (
          <div role="alert" className="rounded-xl border border-destructive bg-card p-6">
            <h3 className="font-semibold text-destructive">Revisa tu búsqueda</h3>
            <ul className="mt-2 list-inside list-disc text-sm">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            <p className="mt-3 text-sm text-muted-foreground">No se muestran resultados con criterios inválidos.</p>
            <Link href={`/semestres/${semester}`} className="text-link mt-2 inline-flex min-h-11 items-center rounded text-sm font-semibold">Limpiar búsqueda</Link>
          </div>
        ) : <>
          <p role="status" aria-live="polite" aria-atomic="true" className="mb-5 text-sm text-muted-foreground">{courses.length} {courses.length === 1 ? "ramo ficticio encontrado" : "ramos ficticios encontrados"}.{filters.q ? ` Búsqueda: «${filters.q}».` : ""}</p>
          {courses.length ? <ul className="grid gap-4 md:grid-cols-2">{courses.map((course) => {
            const materials = courseMaterials(catalog, course.id);
            const counts = { listado: 0, apunte: 0, certamen: 0 };
            materials.forEach((material) => { counts[material.category] += 1; });
            return <li key={course.id}><CourseCard course={course} counts={counts} /></li>;
          })}</ul> : (
            <EmptyState title={filters.q ? "No encontramos ramos con esa búsqueda" : "Aún no hay ramos de ejemplo en este semestre"}>
              <p>{filters.q ? "Prueba con otro nombre o código. También puedes revisar todos los ramos de este semestre." : "El catálogo ficticio es una selección limitada. No significa que este semestre no tenga ramos en la malla oficial; puedes explorar otro semestre."}</p>
              <Link href={filters.q ? `/semestres/${semester}` : "/semestres/1"} className="text-link mt-3 inline-flex min-h-11 items-center rounded font-semibold">{filters.q ? "Limpiar búsqueda" : "Explorar semestre 1"}</Link>
            </EmptyState>
          )}
        </>}
      </section>
    </main>
  );
}
