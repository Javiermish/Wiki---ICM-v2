import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CourseContent } from "@/components/catalog/course-content";
import { getDemoCatalog } from "@/lib/catalog/data";
import { parseCourseFilters } from "@/lib/catalog/course-filters";
import type { SearchParameters } from "@/lib/catalog/filters";
import CourseLoading from "./loading";

type CourseProps = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParameters> };

// Admite slugs locales; espera la validación antes de responder a rutas nuevas.
export const unstable_paramMatching = { slug: "blocking" } as const;

export function generateStaticParams() {
  return getDemoCatalog().courses.map((course) => ({ slug: course.slug }));
}

export default async function CoursePage({ params, searchParams }: CourseProps) {
  const { slug } = await params;
  const exists = getDemoCatalog().courses.some((course) => course.slug === slug);
  // Los slugs locales se resuelven contra el provider, no el catálogo del servidor.
  if (!exists && !/^local-[a-zA-Z0-9-]+$/.test(slug)) notFound();
  return <Suspense fallback={<CourseLoading />}><CourseQuery slug={slug} searchParams={searchParams} /></Suspense>;
}

async function CourseQuery({ slug, searchParams }: { slug: string; searchParams: Promise<SearchParameters> }) {
  const { filters, errors } = parseCourseFilters(await searchParams);
  return <CourseContent slug={slug} filters={filters} errors={errors} />;
}
