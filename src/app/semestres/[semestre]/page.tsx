import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SemesterContent } from "@/components/catalog/semester-content";
import { getDemoCatalog } from "@/lib/catalog/data";
import { catalogSemesters } from "@/lib/catalog/query";
import { parseCatalogFilters, type SearchParameters } from "@/lib/catalog/filters";
import SemesterLoading from "./loading";

type SemesterProps = { params: Promise<{ semestre: string }>; searchParams: Promise<SearchParameters> };

export const unstable_paramMatching = { semestre: "blocking" } as const;

export function generateStaticParams() {
  return catalogSemesters(getDemoCatalog()).map((semestre) => ({ semestre: String(semestre) }));
}

export default async function SemesterPage({ params, searchParams }: SemesterProps) {
  const { semestre } = await params;
  // Los semestres canónicos vacíos también admiten ramos de la demo en memoria.
  if (!/^(?:[1-9]|1[0-2])$/.test(semestre)) notFound();
  return <Suspense fallback={<SemesterLoading />}><SemesterQuery semester={Number(semestre)} searchParams={searchParams} /></Suspense>;
}

async function SemesterQuery({ semester, searchParams }: { semester: number; searchParams: Promise<SearchParameters> }) {
  const query = await searchParams;
  const { filters, errors } = parseCatalogFilters({ q: query.q });
  return <SemesterContent semester={semester} filters={filters} errors={errors} />;
}
