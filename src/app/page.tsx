import { Suspense } from "react";
import { CatalogLoading } from "@/components/catalog/catalog-loading";
import { HomeContent } from "@/components/catalog/home-content";
import { parseCatalogFilters, type SearchParameters } from "@/lib/catalog/filters";

type HomeProps = { searchParams: Promise<SearchParameters> };

export default function Home(props: HomeProps) {
  return <Suspense fallback={<CatalogLoading />}><HomeQuery {...props} /></Suspense>;
}

async function HomeQuery({ searchParams }: HomeProps) {
  const { filters, errors } = parseCatalogFilters(await searchParams);
  return <HomeContent filters={filters} errors={errors} />;
}
