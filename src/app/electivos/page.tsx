import { Suspense } from "react";
import { ElectiveCatalog } from "@/components/catalog/elective-catalog";
import { CatalogLoading } from "@/components/catalog/catalog-loading";
import { parseCatalogFilters, type SearchParameters } from "@/lib/catalog/filters";

export const metadata = { title: "Electivos · Wiki ICM" };

export default function ElectivesPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  return <Suspense fallback={<CatalogLoading />}><ElectivesContent searchParams={searchParams} /></Suspense>;
}

async function ElectivesContent({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const query = await searchParams;
  const { filters, errors } = parseCatalogFilters({ q: query.q });
  return <ElectiveCatalog query={filters.q ?? ""} area={typeof query.area === "string" ? query.area : ""} errors={Array.isArray(query.area) ? [...errors, "Área: usa un solo valor."] : errors} />;
}
