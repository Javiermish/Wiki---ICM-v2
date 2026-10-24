"use client";

import Link from "next/link";
import Form from "next/form";
import { useCourseCatalog } from "./course-catalog-provider";
import { CourseCard } from "./course-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { courseMaterials, searchCourses } from "@/lib/catalog/query";
import { buttonVariants } from "@/components/ui/button";

export function ElectiveCatalog({ query, area, errors }: { query: string; area: string; errors: string[] }) {
  const { catalog } = useCourseCatalog();
  const areaExists = !area || catalog.electiveAreas.some((entry) => entry.id === area);
  const messages = areaExists ? errors : [...errors, "El área solicitada no existe en este catálogo."];
  const groups = catalog.electiveAreas.filter((entry) => !area || entry.id === area);
  return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-8 sm:pb-16">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Electivos" }]} />
    <Badge>Catálogo académico</Badge>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Electivos por área</h1>
    <p className="mt-3 max-w-2xl text-muted-foreground">Electivos sin semestre curricular obligatorio. Cada ramo dispone de Listados, Apuntes y Certámenes, incluso si todavía no tiene documentos. La carga inicial es ilustrativa.</p>
    <nav aria-label="Áreas de electivos" className="mt-6 flex flex-wrap gap-2"><Link href={`/electivos${query ? `?q=${encodeURIComponent(query)}` : ""}`} aria-current={!area ? "page" : undefined} className="text-link inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4">Todas</Link>{catalog.electiveAreas.map((entry) => <Link key={entry.id} href={`/electivos?area=${encodeURIComponent(entry.id)}${query ? `&q=${encodeURIComponent(query)}` : ""}`} aria-current={area === entry.id ? "page" : undefined} className={`text-link inline-flex min-h-11 items-center rounded-lg border px-4 ${area === entry.id ? "border-primary bg-secondary font-semibold" : "border-border bg-card"}`}>{entry.name}</Link>)}</nav>
    <Form action="/electivos" className="my-6 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label="Buscar electivos">
      <div><label htmlFor="elective-q" className="mb-2 block text-sm font-medium">Nombre o código</label><input id="elective-q" name="q" type="search" defaultValue={query} key={query} className="field" maxLength={200} /></div>
      <div><label htmlFor="elective-area" className="mb-2 block text-sm font-medium">Área</label><select id="elective-area" name="area" defaultValue={area} key={area} className="field"><option value="">Todas las áreas</option>{catalog.electiveAreas.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>
      <button type="submit" className={`${buttonVariants()} min-h-11`}>Buscar</button>
    </Form>
    <p className="mb-6 text-sm text-muted-foreground">Puedes <Link href="/gestion/asignaturas" className="text-link inline-flex min-h-11 items-center rounded">proponer un ramo con tu cuenta verificada</Link>. Su incorporación requiere revisión humana; solo administradores pueden gestionar directamente el catálogo.</p>
    {messages.length ? <div role="alert" className="rounded-xl border border-destructive p-5"><h2 className="font-semibold">Revisa la búsqueda</h2><ul className="list-inside list-disc">{messages.map((message) => <li key={message}>{message}</li>)}</ul><Link href="/electivos" className="text-link inline-flex min-h-11 items-center rounded">Limpiar filtros</Link></div> : <div className="space-y-8">{groups.map((group) => {
      const courses = searchCourses(catalog, { q: query, electiveAreaId: group.id });
      return <section key={group.id} aria-labelledby={`area-${group.id}`}>
        <h2 id={`area-${group.id}`} className="text-2xl font-semibold">{group.name}</h2>
        <p className="my-3 text-sm text-muted-foreground">{courses.length} {courses.length === 1 ? "ramo activo" : "ramos activos"}.</p>
        {courses.length ? <ul className="grid gap-4 md:grid-cols-2">{courses.map((course) => {
          const counts = { listado: 0, apunte: 0, certamen: 0 };
          courseMaterials(catalog, course.id).forEach((material) => { counts[material.category] += 1; });
          return <li key={course.id}><CourseCard course={course} counts={counts} /></li>;
        })}</ul> : <p className="rounded-xl border border-border bg-card p-5 text-muted-foreground">Aún no hay ramos activos con estos criterios. El área permanece disponible para nuevos electivos.</p>}
      </section>;
    })}</div>}
  </main>;
}
