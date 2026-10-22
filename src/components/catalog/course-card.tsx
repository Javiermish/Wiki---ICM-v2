"use client";

import Link from "next/link";
import type { Course, MaterialCategory } from "@/domain/catalog";
import { courseHref } from "@/lib/catalog/course-filters";
import { categoryLabels } from "@/lib/catalog/query";
import { courseClassification } from "@/lib/catalog/query";
import { useCourseCatalog } from "./course-catalog-provider";

export function CourseCard({ course, counts }: { course: Course; counts: Record<MaterialCategory, number> }) {
  const { catalog } = useCourseCatalog();
  return (
    <article className="h-full rounded-xl border border-border bg-card p-5 sm:p-6">
      {course.code ? <p className="mb-2 text-xs font-medium text-muted-foreground">Código de ejemplo: {course.code}</p> : null}
      <h3 className="text-xl font-semibold tracking-tight"><Link href={courseHref(course.slug)} className="inline-flex min-h-11 items-center rounded underline-offset-4 hover:text-primary hover:underline">{course.name}</Link></h3>
      <p className="mt-2 text-sm text-muted-foreground">{courseClassification(course, catalog.electiveAreas)}</p>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1" aria-label={`Materiales de ${course.name}`}>
        {(Object.keys(categoryLabels) as MaterialCategory[]).map((category) => (
          <li key={category}><Link href={courseHref(course.slug, { category })} className="text-link inline-flex min-h-11 items-center gap-2 rounded text-sm"><span>{categoryLabels[category]}</span><span className="text-muted-foreground">({counts[category]})</span></Link></li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Recuentos de materiales aprobados ficticios.</p>
    </article>
  );
}
