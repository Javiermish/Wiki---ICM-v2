"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useCourseCatalog } from "./course-catalog-provider";
import { searchCourses } from "@/lib/catalog/query";

export function ElectiveSection() {
  const { catalog } = useCourseCatalog();
  return <section aria-labelledby="electives-heading" className="section-spacing border-t border-border">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-sm font-medium text-primary">Explora tus intereses</p><h2 id="electives-heading" className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Electivos, organizados por área</h2><p className="mt-2 max-w-2xl text-muted-foreground">Cinco puntos de partida para un catálogo que puede crecer. Los electivos no necesitan un semestre curricular.</p></div>
      <Link href="/electivos" className="text-link inline-flex min-h-11 items-center rounded font-semibold">Ver todos los electivos</Link>
    </div>
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{catalog.electiveAreas.map((area) => {
      const courses = searchCourses(catalog, { electiveAreaId: area.id });
      return <li key={area.id}><Link href={`/electivos?area=${encodeURIComponent(area.id)}`} className="group flex h-full min-h-28 flex-col justify-between gap-5 rounded-xl border border-border bg-card p-5 hover:border-primary hover:bg-secondary"><span className="flex items-center justify-between gap-3 font-semibold">{area.name}<ArrowUpRight className="size-4 shrink-0 text-primary" aria-hidden="true" /></span><span className="text-sm text-muted-foreground">{courses.length} {courses.length === 1 ? "ramo activo" : "ramos activos"} · demo</span></Link></li>;
    })}</ul>
  </section>;
}
