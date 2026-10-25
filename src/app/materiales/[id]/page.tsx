import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MaterialContent } from "@/components/materials/material-content";
import { getDemoCatalog } from "@/lib/catalog/data";
import { approvedMaterials, publicMaterialById } from "@/lib/catalog/query";
import { parseCourseFilters } from "@/lib/catalog/course-filters";
import type { SearchParameters } from "@/lib/catalog/filters";
import { materialFileSource } from "@/lib/materials/local-source";
import MaterialLoading from "./loading";
import { getApprovedMaterialRow } from "@/lib/materials/persistent";
import { storedFileMetadata } from "@/lib/materials/stored-source";
import { materialDisplayName } from "@/lib/catalog/query";

type MaterialProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParameters> };
export const unstable_paramMatching = { id: "blocking" } as const;

export function generateStaticParams() {
  return approvedMaterials(getDemoCatalog()).map(({ id }) => ({ id }));
}

export default async function MaterialPage({ params, searchParams }: MaterialProps) {
  const { id } = await params;
  if (id.startsWith("demo-") && !publicMaterialById(getDemoCatalog(), id)) notFound();
  return <Suspense fallback={<MaterialLoading />}><MaterialQuery id={id} searchParams={searchParams} /></Suspense>;
}

async function MaterialQuery({ id, searchParams }: { id: string; searchParams: Promise<SearchParameters> }) {
  const row = id.startsWith("demo-") ? null : await getApprovedMaterialRow(id);
  if (!id.startsWith("demo-") && !row) notFound();
  const [file, query] = await Promise.all([row ? storedFileMetadata(row) : materialFileSource.resolve(id), searchParams]);
  const { filters, errors } = parseCourseFilters(query);
  const hasContext = query.tipo !== undefined && !errors.length;
  return <MaterialContent id={id} file={file} filters={filters} hasContext={hasContext} sampleTitle={row ? materialDisplayName({ category: row.category, documentNumber: row.document_number }, { academicYear: row.academic_year, academicTerm: row.academic_term }) : publicMaterialById(getDemoCatalog(), id)?.displayName} />;
}
