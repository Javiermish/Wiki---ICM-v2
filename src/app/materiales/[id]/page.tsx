import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MaterialContent } from "@/components/materials/material-content";
import { getDemoCatalog } from "@/lib/catalog/data";
import { approvedMaterials, publicMaterialById } from "@/lib/catalog/query";
import { parseCourseFilters } from "@/lib/catalog/course-filters";
import type { SearchParameters } from "@/lib/catalog/filters";
import { materialFileSource } from "@/lib/materials/local-source";
import MaterialLoading from "./loading";

type MaterialProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParameters> };
export const unstable_paramMatching = { id: "not-found" } as const;

export function generateStaticParams() {
  return approvedMaterials(getDemoCatalog()).map(({ id }) => ({ id }));
}

export default async function MaterialPage({ params, searchParams }: MaterialProps) {
  const { id } = await params;
  if (!publicMaterialById(getDemoCatalog(), id)) notFound();
  return <Suspense fallback={<MaterialLoading />}><MaterialQuery id={id} searchParams={searchParams} /></Suspense>;
}

async function MaterialQuery({ id, searchParams }: { id: string; searchParams: Promise<SearchParameters> }) {
  const [file, query] = await Promise.all([materialFileSource.resolve(id), searchParams]);
  const { filters, errors } = parseCourseFilters(query);
  const hasContext = query.tipo !== undefined && !errors.length;
  return <MaterialContent id={id} file={file} filters={filters} hasContext={hasContext} sampleTitle={publicMaterialById(getDemoCatalog(), id)?.displayName} />;
}
