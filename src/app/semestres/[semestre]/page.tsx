import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SemesterContent } from "@/components/catalog/semester-content";
import { parseCatalogFilters, type SearchParameters } from "@/lib/catalog/filters";
import SemesterLoading from "./loading";

type SemesterProps = { params: Promise<{ semestre: string }>; searchParams: Promise<SearchParameters> };

export const unstable_paramMatching = { semestre: "blocking" } as const;

export function generateStaticParams() {
  return Array.from({ length: 12 }, (_, index) => ({ semestre: String(index + 1) }));
}

export default async function SemesterPage({ params, searchParams }: SemesterProps) {
  const { semestre } = await params;
  // Los semestres canónicos admiten futuros ramos sin cambiar las rutas.
  if (!/^(?:[1-9]|1[0-2])$/.test(semestre)) notFound();
  return <Suspense fallback={<SemesterLoading />}><SemesterQuery semester={Number(semestre)} searchParams={searchParams} /></Suspense>;
}

async function SemesterQuery({ semester, searchParams }: { semester: number; searchParams: Promise<SearchParameters> }) {
  const query = await searchParams;
  const { filters, errors } = parseCatalogFilters({ q: query.q });
  return <SemesterContent semester={semester} filters={filters} errors={errors} />;
}
