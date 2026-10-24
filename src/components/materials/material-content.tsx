"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentReader } from "@/components/materials/document-reader";
import { DemoReportDialog } from "@/components/materials/demo-report-dialog";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import type { CatalogFilters } from "@/domain/catalog";
import type { PublicMaterialFile } from "@/domain/material-file";
import { categoryLabels, courseClassification, courseParentBreadcrumb, publicMaterialById } from "@/lib/catalog/query";
import { courseHref } from "@/lib/catalog/course-filters";

export function MaterialContent({ id, file, filters, hasContext, sampleTitle }: { id: string; file: PublicMaterialFile | null; filters: CatalogFilters; hasContext: boolean; sampleTitle?: string }) {
  const { catalog } = useCourseCatalog();
  const material = publicMaterialById(catalog, id);
  if (!material && sampleTitle) return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 py-10">
    <Badge>Muestra local independiente del catálogo</Badge>
    <h1 className="mt-3 text-3xl font-semibold">{sampleTitle}</h1>
    <p className="my-5 text-muted-foreground">Este archivo de demostración sigue disponible, pero su ramo no está en el catálogo activo o PostgreSQL no está disponible. No se reemplazan los datos académicos por fixtures.</p>
    {file ? <a href={file.downloadUrl} download={file.downloadName} className={`${buttonVariants()} mb-5 min-h-11`}>Descargar {file.extension.toUpperCase()}</a> : <h2 className="my-5 text-xl font-semibold">Archivo no disponible</h2>}
    {file ? <DocumentReader key={id} file={file} title={sampleTitle} /> : null}
    <Link href="/" className="text-link mt-5 inline-flex min-h-11 items-center">Volver al catálogo</Link>
  </main>;
  if (!material) return <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16"><EmptyState title="Material no disponible"><p>Este material no está disponible en el catálogo público de demostración.</p><Link href="/" className="text-link mt-3 inline-flex min-h-11 items-center rounded font-semibold">Volver al catálogo</Link></EmptyState></main>;
  const backHref = courseHref(material.course.slug, hasContext ? { ...filters, category: material.category } : { category: material.category });
  const classification = courseClassification(material.course, catalog.electiveAreas);
  const details = [
    ["Asignatura", material.course.name],
    [material.course.kind === "elective" ? "Área electiva" : "Semestre curricular", material.course.kind === "elective" ? classification : String(material.course.curricularSemester)],
    ["Categoría", { listado: "Listado", apunte: "Apuntes", certamen: "Certamen" }[material.category]],
    ["Año académico", String(material.academicYear)],
    ["Semestre académico", String(material.academicTerm)],
    ["Período académico", material.academicPeriod],
    ...(material.documentNumber !== null ? [["Número del material", String(material.documentNumber)]] : []),
    ...(material.section ? [["Sección", material.section]] : []),
    ...(material.version ? [["Versión", material.version]] : []),
    ...(file ? [["Formato y tamaño", `${file.extension.toUpperCase()} · ${(file.bytes / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} KB`]] : []),
  ];
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, courseParentBreadcrumb(material.course, catalog.electiveAreas), { label: material.course.name, href: `/ramos/${material.course.slug}` }, { label: categoryLabels[material.category], href: backHref }, { label: material.displayName }]} />
    <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0 max-w-2xl">
        <Badge>Documento de demostración</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{material.displayName}</h1>
        <p className="mt-3 text-muted-foreground">{material.course.name} · {classification}</p>
        {material.description ? <p className="mt-1 text-sm text-muted-foreground">{material.description}</p> : null}
        {material.section || material.version ? <p className="mt-1 text-sm text-muted-foreground">{[material.section ? `Sección ${material.section}` : null, material.version ? `Versión ${material.version}` : null].filter(Boolean).join(" · ")}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FavoriteButton materialId={material.id} materialName={`${material.displayName} · ${material.course.name}${material.section ? ` · Sección ${material.section}` : ""}`} />
        {file ? <a href={file.downloadUrl} download={file.downloadName} className={`${buttonVariants()} min-h-11`}><Download aria-hidden="true" className="size-4" />Descargar {file.extension.toUpperCase()}</a> : null}
        <DemoReportDialog materialId={material.id} materialName={material.displayName} />
      </div>
    </div>
    {material.course.status === "archived" ? <div className="mb-6 rounded-xl border border-border bg-muted p-4 text-sm"><p><strong>Ramo archivado.</strong> Este material aprobado sigue disponible para lectura y descarga.</p><Link href="/gestion/asignaturas" className="text-link mt-2 inline-flex min-h-11 items-center rounded font-semibold">Gestionar ramos · demo local</Link></div> : null}
    {file ? <><DocumentReader key={id} file={file} title={material.displayName} /><p className="mt-3 text-sm text-muted-foreground">Archivo original creado para esta demostración, de distribución autorizada. No es una evaluación ni un apunte oficial.</p></> : <section aria-labelledby="unavailable-title" className="rounded-xl border border-border bg-card p-6 sm:p-10"><h2 id="unavailable-title" className="text-xl font-semibold">Archivo no disponible</h2><p className="mt-2 max-w-2xl text-muted-foreground">Esta ficha contiene metadatos ficticios, pero no tiene un archivo de demostración disponible. No es posible visualizarlo ni descargarlo.</p><Link href={backHref} className="text-link mt-4 inline-flex min-h-11 items-center rounded font-semibold">Volver al ramo y categoría</Link></section>}
    <section aria-labelledby="material-details" className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 id="material-details" className="text-xl font-semibold">Información del material</h2>
      <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{details.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    </section>
    <Link href={backHref} className="text-link mt-5 inline-flex min-h-11 items-center rounded font-semibold">Volver a {material.course.name} · {categoryLabels[material.category]}</Link>
  </main>;
}
