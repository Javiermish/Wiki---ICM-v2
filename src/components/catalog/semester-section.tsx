import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CatalogFilters, PublicMaterial } from "@/domain/catalog";

export function SemesterSection({ semesters, materials, filters }: { semesters: readonly number[]; materials: readonly PublicMaterial[]; filters: CatalogFilters }) {
  return (
    <section id="explorar" aria-labelledby="semesters-heading" className="section-spacing">
      <div className="mb-6 max-w-2xl">
        <h2 id="semesters-heading" className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Empieza por tu semestre</h2>
        <p className="mt-2 text-muted-foreground">Explora materiales según el semestre curricular del ramo. Esta selección es ilustrativa: no cubre ni valida un plan de estudios.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {semesters.map((semester) => {
          const entries = materials.filter((material) => material.course.curricularSemester === semester);
          const courses = [...new Map(entries.map((material) => [material.course.id, material.course])).values()];
          const current = filters.curricularSemester === semester;
          return (
            <section key={semester} className={`rounded-xl border bg-card p-5 sm:p-6 ${current ? "border-primary" : "border-border"}`} aria-labelledby={`semester-${semester}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 id={`semester-${semester}`} className="text-lg font-semibold">Semestre curricular {semester}</h3>
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary font-semibold text-secondary-foreground">{semester}</span>
              </div>
              {courses.length ? (
                <ul className="my-3 divide-y divide-border">
                  {courses.map((course) => <li key={course.id}><Link href={`/ramos/${course.slug}`} className="inline-flex min-h-11 items-center rounded text-sm underline decoration-border underline-offset-4 hover:text-primary hover:decoration-primary">{course.name}</Link></li>)}
                </ul>
              ) : <p className="my-4 text-sm text-muted-foreground">Todavía no hay ramos de ejemplo en este semestre.</p>}
              <Link href={`/semestres/${semester}`} className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Explorar semestre {semester}<ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "material ficticio" : "materiales ficticios"} en este grupo de ejemplo.</p>
            </section>
          );
        })}
      </div>
    </section>
  );
}
