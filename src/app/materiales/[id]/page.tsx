import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DocumentReader } from "@/components/materials/document-reader";
import { DemoReportDialog } from "@/components/materials/demo-report-dialog";
import { demoCatalog } from "@/fixtures/catalog";
import { approvedMaterials, categoryLabels, publicMaterialById } from "@/lib/catalog/query";
import { courseHref, parseCourseFilters } from "@/lib/catalog/course-filters";
import type { SearchParameters } from "@/lib/catalog/filters";
import { materialFileSource } from "@/lib/materials/local-source";
import MaterialLoading from "./loading";

type MaterialProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParameters> };
export const unstable_paramMatching = { id: "not-found" } as const;
export function generateStaticParams() {
  return approvedMaterials(demoCatalog).map(({ id }) => ({ id }));
}

export default function MaterialPage(props: MaterialProps) {
  return <Suspense fallback={<MaterialLoading />}><MaterialContent {...props} /></Suspense>;
}

async function MaterialContent({ params, searchParams }: MaterialProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const material = publicMaterialById(demoCatalog, id);
  if (!material) notFound();
  const file = await materialFileSource.resolve(id);
  const parsed = parseCourseFilters(query);
  const hasContext = query.tipo !== undefined && !parsed.errors.length;
  const backHref = courseHref(material.course.slug, hasContext ? { ...parsed.filters, category: material.category } : { category: material.category });
  const details = [
    ["Asignatura", material.course.name],
    ["Semestre curricular", String(material.course.curricularSemester)],
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
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: `Semestre curricular ${material.course.curricularSemester}`, href: `/semestres/${material.course.curricularSemester}` }, { label: material.course.name, href: `/ramos/${material.course.slug}` }, { label: categoryLabels[material.category], href: backHref }, { label: material.displayName }]} />
    <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0 max-w-2xl">
        <Badge>Documento de demostración</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{material.displayName}</h1>
        <p className="mt-3 text-muted-foreground">{material.course.name} · Semestre curricular {material.course.curricularSemester}</p>
        {material.description ? <p className="mt-1 text-sm text-muted-foreground">{material.description}</p> : null}
        {material.section || material.version ? <p className="mt-1 text-sm text-muted-foreground">{[material.section ? `Sección ${material.section}` : null, material.version ? `Versión ${material.version}` : null].filter(Boolean).join(" · ")}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {file ? <a href={file.downloadUrl} download={file.downloadName} className={`${buttonVariants()} min-h-11`}><Download aria-hidden="true" className="size-4" />Descargar {file.extension.toUpperCase()}</a> : null}
        <DemoReportDialog materialName={material.displayName} />
      </div>
    </div>
    {file ? <><DocumentReader key={id} file={file} title={material.displayName} /><p className="mt-3 text-sm text-muted-foreground">Archivo original creado para esta demostración, de distribución autorizada. No es una evaluación ni un apunte oficial.</p></> : <section aria-labelledby="unavailable-title" className="rounded-xl border border-border bg-card p-6 sm:p-10"><h2 id="unavailable-title" className="text-xl font-semibold">Archivo no disponible</h2><p className="mt-2 max-w-2xl text-muted-foreground">Esta ficha contiene metadatos ficticios, pero no tiene un archivo de demostración disponible. No es posible visualizarlo ni descargarlo.</p><Link href={backHref} className="text-link mt-4 inline-flex min-h-11 items-center rounded font-semibold">Volver al ramo y categoría</Link></section>}
    <section aria-labelledby="material-details" className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 id="material-details" className="text-xl font-semibold">Información del material</h2>
      <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{details.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    </section>
    <Link href={backHref} className="text-link mt-5 inline-flex min-h-11 items-center rounded font-semibold">Volver a {material.course.name} · {categoryLabels[material.category]}</Link>
  </main>;
}
