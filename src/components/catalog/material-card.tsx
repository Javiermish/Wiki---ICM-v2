import Link from "next/link";
import { FileText } from "lucide-react";
import type { PublicMaterial } from "@/domain/catalog";
import { categoryLabels } from "@/lib/catalog/query";
import { Badge } from "@/components/ui/badge";

export function MaterialCard({ material }: { material: PublicMaterial }) {
  return (
    <article className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[auto_1fr] sm:p-6 lg:grid-cols-[auto_1fr_17rem] lg:gap-6">
      <div className="hidden size-11 items-center justify-center rounded-lg bg-muted text-primary sm:flex"><FileText className="size-5" aria-hidden="true" /></div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2"><Badge>{categoryLabels[material.category]}</Badge><span className="text-xs text-muted-foreground">Aprobado · ficticio</span></div>
        <h3 className="text-lg font-semibold tracking-tight">{material.displayName}</h3>
        {material.section || material.version ? <p className="mt-1 text-sm text-muted-foreground">{[material.section ? `Sección ${material.section}` : null, material.version ? `Versión ${material.version}` : null].filter(Boolean).join(" · ")}</p> : null}
        {material.description ? <p className="mt-1 text-sm text-muted-foreground">{material.description}</p> : null}
      </div>
      <dl className="space-y-2 border-t border-border pt-4 text-sm sm:col-start-2 lg:col-start-auto lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div><dt className="sr-only">Ramo de ejemplo</dt><dd className="font-semibold"><Link href={`/ramos/${material.course.slug}`} className="inline-flex min-h-11 items-center rounded underline decoration-border underline-offset-4 hover:text-primary hover:decoration-primary">{material.course.name}</Link></dd><dd className="text-muted-foreground">Semestre curricular {material.course.curricularSemester}</dd></div>
        <div className="flex flex-wrap gap-x-1"><dt className="text-muted-foreground">Período académico:</dt><dd className="font-medium">{material.academicPeriod}</dd></div>
      </dl>
    </article>
  );
}
