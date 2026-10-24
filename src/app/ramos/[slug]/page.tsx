import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CourseContent } from "@/components/catalog/course-content";
import { getPublicCatalog } from "@/lib/catalog/persistent";
import { parseCourseFilters } from "@/lib/catalog/course-filters";
import type { SearchParameters } from "@/lib/catalog/filters";
import CourseLoading from "./loading";

type CourseProps = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParameters> };

// Espera la validación antes de responder a rutas nuevas persistentes.
export const unstable_paramMatching = { slug: "blocking" } as const;

export default function CoursePage(props: CourseProps) {
  return <Suspense fallback={<CourseLoading />}><CourseQuery {...props} /></Suspense>;
}

async function CourseQuery({ params, searchParams }: CourseProps) {
  const { slug } = await params;
  let catalog;
  try { catalog = await getPublicCatalog(); } catch {
    return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><h1 className="text-3xl font-semibold">No se pudo cargar el ramo</h1><p role="alert" className="mt-4">El catálogo no está disponible. Reintenta cuando se restablezca la conexión con PostgreSQL; no se mostrará un ramo de ejemplo como reemplazo.</p><a href="" className="text-link mt-3 inline-flex min-h-11 items-center">Reintentar</a></main>;
  }
  if (!catalog.courses.some((course) => course.slug === slug)) notFound();
  const { filters, errors } = parseCourseFilters(await searchParams);
  return <CourseContent slug={slug} filters={filters} errors={errors} />;
}
