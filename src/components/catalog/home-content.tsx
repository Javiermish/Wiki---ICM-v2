"use client";

import Link from "next/link";
import { BookOpen, HeartHandshake, ShieldCheck } from "lucide-react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { SearchForm } from "@/components/catalog/search-form";
import { SemesterSection } from "@/components/catalog/semester-section";
import { ElectiveSection } from "@/components/catalog/elective-section";
import { MaterialCard } from "@/components/catalog/material-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatalogFilters } from "@/domain/catalog";
import { approvedMaterials, catalogFacets, catalogSemesters, courseClassification, searchCatalog, searchCourses } from "@/lib/catalog/query";
import { hasCatalogFilters } from "@/lib/catalog/filters";

export function HomeContent({ filters, errors }: { filters: CatalogFilters; errors: string[] }) {
  const { catalog } = useCourseCatalog();
  const searching = hasCatalogFilters(filters) || errors.length > 0;
  const materials = errors.length ? [] : searchCatalog(catalog, filters);
  const courses = filters.q && !errors.length ? searchCourses(catalog, { q: filters.q, curricularSemester: filters.curricularSemester }) : [];
  const facets = catalogFacets(catalog);
  return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <section aria-labelledby="home-heading" className="hero-panel">
        <div className="grid gap-8 lg:grid-cols-[1fr_15rem] lg:gap-12">
          <div>
            <p className="mb-4 text-sm text-[var(--hero-muted)]">Biblioteca colaborativa de Ingeniería Civil Matemática</p>
            <h1 id="home-heading" className="max-w-2xl text-[2rem] leading-[1.12] font-semibold tracking-tight sm:text-5xl">Encuentra material para seguir aprendiendo.</h1>
            <p className="mt-5 max-w-xl text-base text-[var(--hero-muted)]">Apuntes, listados y certámenes, reunidos en un mismo lugar. Para repasar una idea, practicar un poco más y compartir lo aprendido.</p>
          </div>
          <dl className="hidden space-y-4 border-l border-[var(--hero-rule)] pl-6 lg:block">
            <div><dt className="font-semibold">Listados</dt><dd className="text-sm text-[var(--hero-muted)]">Practica a tu ritmo.</dd></div>
            <div><dt className="font-semibold">Apuntes</dt><dd className="text-sm text-[var(--hero-muted)]">Vuelve a las ideas clave.</dd></div>
            <div><dt className="font-semibold">Certámenes</dt><dd className="text-sm text-[var(--hero-muted)]">Prepara tu próxima evaluación.</dd></div>
          </dl>
        </div>
        <SearchForm filters={filters} years={facets.years} />
      </section>

      <SemesterSection semesters={catalogSemesters(catalog)} materials={approvedMaterials(catalog)} filters={filters} />
      <ElectiveSection />

      <section id="materiales" aria-labelledby="materials-heading" className="section-spacing border-t border-border">
        {searching ? <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Resultados" }]} /> : null}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="materials-heading" className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{searching ? "Resultados de tu búsqueda" : "Materiales para explorar"}</h2>
            <p className="mt-2 text-muted-foreground">{filters.q ? <>Consulta: «{filters.q}». </> : null}Ejemplos aprobados en el catálogo ficticio. Abre un material para leer y descargar los archivos de demostración disponibles.</p>
          </div>
          {searching ? <Link className="text-link inline-flex min-h-11 items-center rounded text-sm font-semibold" href="/#materiales">Restablecer búsqueda</Link> : <Badge>Catálogo de demostración</Badge>}
        </div>
        {errors.length ? (
          <div role="alert" className="rounded-xl border border-destructive bg-card p-6">
            <h3 className="font-semibold text-destructive">Revisa los criterios de búsqueda</h3>
            <ul className="mt-2 list-inside list-disc text-sm">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            <p className="mt-3 text-sm text-muted-foreground">No se muestran resultados con criterios inválidos. Corrige el formulario o restablece la búsqueda.</p>
          </div>
        ) : (
          <>
            {filters.q ? <section aria-labelledby="found-courses-heading" className="mb-6 rounded-xl border border-border bg-card p-5">
              <h3 id="found-courses-heading" className="text-lg font-semibold">Asignaturas encontradas</h3>
              <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-muted-foreground">{courses.length} {courses.length === 1 ? "asignatura encontrada" : "asignaturas encontradas"}, incluso sin materiales.</p>
              {courses.length ? <ul className="mt-3 divide-y divide-border">{courses.map((course) => <li key={course.id} className="py-2"><Link href={`/ramos/${course.slug}`} className="text-link inline-flex min-h-11 items-center rounded font-semibold">{course.name}{course.code ? ` · ${course.code}` : ""}</Link><p className="text-sm text-muted-foreground">{courseClassification(course, catalog.electiveAreas)}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Prueba con otro nombre o código de asignatura.</p>}
            </section> : null}
            <p role="status" aria-live="polite" aria-atomic="true" className="mb-4 text-sm text-muted-foreground">{materials.length} {materials.length === 1 ? "material ficticio encontrado" : "materiales ficticios encontrados"}.</p>
            {materials.length ? <ul className="space-y-3">{materials.map((material) => <li key={material.id}><MaterialCard material={material} /></li>)}</ul> : (
              <EmptyState title="No encontramos materiales de ejemplo">
                <p>Prueba con otro ramo o combina menos filtros. Que no haya ejemplos no significa que el ramo no exista en la malla.</p>
                <Link href="/#materiales" className="text-link mt-3 inline-flex min-h-11 items-center rounded font-semibold">Limpiar búsqueda y filtros</Link>
              </EmptyState>
            )}
          </>
        )}
      </section>

      <section id="comunidad" aria-labelledby="community-heading" className="section-spacing border-t border-border">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <HeartHandshake className="mb-4 size-8 text-primary" aria-hidden="true" />
            <h2 id="community-heading" className="max-w-md text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Lo que aprendes puede ayudar a alguien más.</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">Wiki ICM nace como una biblioteca hecha entre estudiantes. Queremos que encontrar material sea sencillo y que el conocimiento siga circulando.</p>
          </div>
          <div className="space-y-6 lg:pt-2">
            <div className="flex gap-4"><BookOpen className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Lectura abierta, sin registro</h3><p className="mt-1 text-sm text-muted-foreground">El material aprobado será público. Esta portada usa únicamente ejemplos ficticios.</p></div></div>
            <div className="flex gap-4"><ShieldCheck className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Compartir con cuidado</h3><p className="mt-1 text-sm text-muted-foreground">Cada aporte pasará por revisión humana antes de publicarse. Solo se aceptará material autorizado.</p></div></div>
            <div className="space-y-3 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground"><p><strong className="text-foreground">Prepara un aporte en una demostración local.</strong> No hay registro, subidas ni publicaciones reales. Los favoritos solo se conservan durante la navegación de esta pestaña y los reportes son simulados.</p><Link href="/aportar" className="text-link inline-flex min-h-11 items-center rounded font-semibold">Preparar un aporte</Link></div>
          </div>
        </div>
      </section>
    </main>
  );
}
